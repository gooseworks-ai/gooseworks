import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { requestJson } from '../utils/http';
import * as logger from '../utils/logger';

/**
 * `gooseworks log` — record one diagnostic event for the current skill/CLI run
 * (GOOSE-2862). This is the SHELL-side writer, alongside the agent's
 * `log_cli_event` MCP tool and the Python `gw_log()` helper in `media_proxy.py`.
 * All three POST to `/api/internal/cli-logs` and land in the same `cli_run_logs`
 * table, grouped by run id.
 *
 * Use it in a skill's shell steps whenever something is off — an API is failing,
 * a required input/asset is missing, an instruction is ambiguous, a step is
 * blocked — or just to mark progress. Best-effort: a POST failure warns and
 * exits 0 so it never breaks the script that called it.
 */
export const logCommand = new Command('log')
  .description(
    'Record a diagnostic event for the current run (broken API, missing input, ' +
      'confusion, or a progress note). Visible to the GooseWorks team.',
  )
  .argument('<message>', 'Plain-language description of what happened / what is wrong')
  .option(
    '--event-type <type>',
    'info | step | generation | api_failure | error | blocker | missing_input | confusion',
    'info',
  )
  .option('--level <level>', 'debug | info | warn | error', 'info')
  .option('--skill <name>', 'Skill/capability being run (default: $GW_SKILL)')
  .option('--run-id <id>', 'Run id to group events (default: $GW_RUN_ID)')
  .option('--project-id <id>', 'Ad project id (default: $GW_PROJECT_ID)')
  .option('--provider <name>', 'e.g. "fal", "elevenlabs"')
  .option('--model <id>', 'Model id, when the event is about a generation')
  .option('--duration-ms <n>', 'Duration of the operation, in milliseconds')
  .option('--details <json>', 'Free-form JSON context (error text, request/response, step…)')
  .option('--quiet', 'Do not print a confirmation line')
  .action(
    async (
      message: string,
      opts: {
        eventType?: string;
        level?: string;
        skill?: string;
        runId?: string;
        projectId?: string;
        provider?: string;
        model?: string;
        durationMs?: string;
        details?: string;
        quiet?: boolean;
      },
    ) => {
      const creds = getCredentials();
      if (!creds) {
        logger.error('Not logged in. Run "gooseworks login" first.');
        process.exit(1);
      }

      let details: unknown;
      if (opts.details !== undefined) {
        try {
          details = JSON.parse(opts.details);
        } catch (err) {
          logger.error(`--details must be valid JSON: ${(err as Error).message}`);
          process.exit(1);
        }
      }

      const runId = opts.runId ?? process.env.GW_RUN_ID;
      if (!runId) {
        logger.error('No run id. Pass --run-id or set GW_RUN_ID in the environment.');
        process.exit(1);
      }

      const projectId = opts.projectId ?? process.env.GW_PROJECT_ID;
      const durationMs =
        opts.durationMs !== undefined ? Number(opts.durationMs) : undefined;

      try {
        const res = await requestJson<{ ok?: boolean; id?: string }>({
          apiBase: creds.api_base,
          apiKey: creds.api_key,
          method: 'POST',
          path: '/api/internal/cli-logs',
          query: projectId ? { project_id: projectId } : undefined,
          body: {
            run_id: runId,
            message,
            event_type: opts.eventType,
            level: opts.level,
            skill: opts.skill ?? process.env.GW_SKILL,
            provider: opts.provider,
            model: opts.model,
            duration_ms:
              durationMs !== undefined && Number.isFinite(durationMs)
                ? durationMs
                : undefined,
            details,
            source: 'cli',
          },
        });
        if (!opts.quiet) {
          logger.success(`Logged ${opts.eventType ?? 'info'} event${res.id ? ` (${res.id})` : ''}`);
        }
      } catch (err) {
        // Diagnostics must never break the caller — warn and exit 0.
        logger.warn(`Could not record log event: ${(err as Error).message}`);
      }
    },
  );
