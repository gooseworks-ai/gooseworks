// A scene the customer had remade (video_fix remake) is a new piece: ordered
// again under its own key, never served from this computer's earlier take,
// while every other piece still comes from the run folder.
import { fakeLine, runMake, tempHome } from './harness';

const withTakes = (takes: unknown) => (body: any) => ({ ...body, takes });

describe('a remade piece', () => {
  it('is ordered anew under its take, and the rest is reused', async () => {
    const home = tempHome();
    const first = fakeLine();
    expect((await runMake({ home, line: first })).status).toBe('done');
    const firstKey = first.pieces.find((p) => p.piece_key === 'clips.scene-1')!.idempotency_key;

    const second = fakeLine({ planBody: withTakes([{ piece_key: 'clips.scene-1', take: 2 }]) });
    expect((await runMake({ home, line: second })).status).toBe('done');
    expect(second.pieces.map((p) => p.piece_key)).toEqual(['clips.scene-1']);
    expect(second.pieces[0].idempotency_key).not.toBe(firstKey);

    // The same take again is the piece just made: nothing is ordered.
    const third = fakeLine({ planBody: withTakes([{ piece_key: 'clips.scene-1', take: 2 }]) });
    expect((await runMake({ home, line: third })).status).toBe('done');
    expect(third.pieces).toHaveLength(0);
  });

  it('ignores takes that name no piece of the step or are not a later take', async () => {
    const home = tempHome();
    expect((await runMake({ home, line: fakeLine() })).status).toBe('done');
    const again = fakeLine({ planBody: withTakes([{ piece_key: 'other.scene-1', take: 2 }, { piece_key: 'clips.scene-2', take: 1 }, 'bad']) });
    expect((await runMake({ home, line: again })).status).toBe('done');
    expect(again.pieces).toHaveLength(0);
  });
});
