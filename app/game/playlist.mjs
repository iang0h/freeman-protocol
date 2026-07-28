export function refillShuffleBag(trackIds, previousTrackId, random = Math.random) {
  const bag = [...trackIds];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }
  if (bag.length > 1 && bag[0] === previousTrackId) {
    const replacementIndex = bag.findIndex(
      (trackId) => trackId !== previousTrackId,
    );
    [bag[0], bag[replacementIndex]] = [bag[replacementIndex], bag[0]];
  }
  return bag;
}

export function takeNextTrack(state, random = Math.random) {
  const bag =
    state.bag.length > 0
      ? [...state.bag]
      : refillShuffleBag(state.tracks, state.previous, random);
  const track = bag.shift() ?? null;
  return {
    track,
    state: {
      tracks: [...state.tracks],
      bag,
      previous: track,
    },
  };
}
