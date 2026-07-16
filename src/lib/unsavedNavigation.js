export function shouldBlockUnsavedNavigation({ dirty, currentLocation, nextLocation }) {
  if (!dirty) return false;
  return [currentLocation.pathname, currentLocation.search, currentLocation.hash].join('')
    !== [nextLocation.pathname, nextLocation.search, nextLocation.hash].join('');
}
