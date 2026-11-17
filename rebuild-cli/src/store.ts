import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { CliError, hasCode } from "./errors.js";

const clientSchema = z.object({ client_id: z.string().min(1), issuer: z.url() }).passthrough();
const tokenSchema = z.object({
  access_token: z.string().min(1), token_type: z.string().refine((value) => value.toLowerCase() === "bearer"), issuer: z.url(),
  refresh_token: z.string().min(1).optional(), scope: z.string().optional(),
  expires_in: z.number().nonnegative().optional(),
}).passthrough();
export const credentialsSchema = z.object({
  version: z.literal(1), server: z.url(), redirectUrl: z.url(),
  client: clientSchema, tokens: tokenSchema, savedAt: z.number().int().positive(),
}).strict();
export type Credentials = z.infer<typeof credentialsSchema>;

async function requirePrivate(path: string, directory: boolean): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || (directory ? !entry.isDirectory() : !entry.isFile())) {
    throw new CliError("The credential path must be a regular private file or directory, without symlinks.");
  }
  if (process.platform !== "win32" && ((entry.mode & 0o077) !== 0 || entry.uid !== process.getuid?.())) {
    throw new CliError("Credential storage must belong to you and be private (directory 0700, files 0600).");
  }
}

export class CredentialStore {
  readonly directory: string;
  readonly path: string;
  constructor(readonly server: string, directory?: string) {
    if (process.platform === "win32") throw new CliError("This preview requires macOS or Linux private file permissions.");
    this.directory = resolve(directory ?? join(homedir(), ".gooseworks-next"));
    this.path = join(this.directory, `${createHash("sha256").update(server).digest("hex")}.json`);
  }

  async withLock<Result>(run: () => Promise<Result>): Promise<Result> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await requirePrivate(this.directory, true);
    const lockPath = `${this.path}.lock`;
    let lock;
    try {
      lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      if (hasCode(error, "EEXIST")) {
        throw new CliError(`Another command holds the credential lock. If no gooseworks-next command is running, remove ${lockPath} and retry.`);
      }
      throw error;
    }
    try {
      await lock.writeFile(String(process.pid));
      return await run();
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }

  async read(): Promise<Credentials | undefined> {
    try {
      await requirePrivate(this.path, false);
      const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if ((await file.stat()).size > 1024 * 1024) throw new CliError("The credential file is too large.");
        const result = credentialsSchema.safeParse(JSON.parse(await file.readFile("utf8")));
        if (!result.success || result.data.server !== this.server || result.data.client.issuer !== result.data.tokens.issuer) {
          throw new CliError("Stored credentials are invalid for this server. Run logout, then login again.");
        }
        return result.data;
      } finally {
        await file.close();
      }
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      if (error instanceof SyntaxError) throw new CliError("Stored credentials are not valid JSON. Run logout, then login again.");
      throw error;
    }
  }

  async save(credentials: Credentials): Promise<void> {
    const parsed = credentialsSchema.parse(credentials);
    if (parsed.server !== this.server || parsed.client.issuer !== parsed.tokens.issuer) {
      throw new CliError("Refusing to save credentials for a different server or issuer.");
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      try {
        await file.writeFile(JSON.stringify(parsed));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.path);
    } catch (error) {
      await unlink(temporary);
      throw error;
    }
  }

  async remove(): Promise<void> {
    try {
      await requirePrivate(this.path, false);
      await unlink(this.path);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
}
