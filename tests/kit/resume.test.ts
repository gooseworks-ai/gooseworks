// Rule: a resume never orders a finished piece again; only the pieces that
// were not made are ordered, so the customer never pays twice.
import { fakeLine, lineCalls, lineRoute, runMake, tempHome } from './harness';

describe('video make resumes without re-ordering finished pieces', () => {
  it('orders only the unfinished piece after a stop', async () => {
    const home = tempHome();

    // First run: scene 1 is made, then the line stops the video at scene 2.
    const first = fakeLine({
      piece: (req) =>
        req.piece_key === 'clips.scene-2'
          ? { status: 409, json: { error: { code: 'video_stopped', error: 'This video was stopped.', fix: 'Press Continue on the card.', next: 'stop' } } }
          : undefined,
    });
    const stopped = await runMake({ home, line: first });
    expect(stopped.status).toBe('stopped');
    expect(first.pieces.map((p) => p.piece_key)).toEqual(['clips.scene-1', 'clips.scene-2']);
    expect(lineCalls(first.seen, '/upload')).toHaveLength(0);

    // Same command again: scene 1 comes from the run folder, scene 2 is ordered once.
    const second = fakeLine();
    const done = await runMake({ home, line: second });
    expect(done.status).toBe('done');
    expect(second.pieces.map((p) => p.piece_key)).toEqual(['clips.scene-2']);
    expect(lineCalls(second.seen, '/upload/up_1/done')).toHaveLength(1);
  });

  it('orders nothing again when every piece is already made', async () => {
    const home = tempHome();
    const first = fakeLine({ upload: 'fail' });
    await runMake({ home, line: first });
    expect(first.pieces).toHaveLength(2);

    const again = fakeLine();
    expect((await runMake({ home, line: again })).status).toBe('done');
    expect(again.pieces).toHaveLength(0);
  });

  it('asks the check again for a video already sent, instead of sending it again', async () => {
    const home = tempHome();
    const first = fakeLine({ upload: 'fail' });
    await runMake({ home, line: first });
    expect(lineRoute(first.seen, '/upload')).toHaveLength(1);

    const again = fakeLine();
    expect((await runMake({ home, line: again })).status).toBe('done');
    expect(lineRoute(again.seen, '/upload')).toHaveLength(0);
    expect(again.seen.filter((s) => s.url.startsWith('https://store.test'))).toHaveLength(0);
    expect(lineRoute(again.seen, '/upload/up_1/done')).toHaveLength(1);
  });
});
