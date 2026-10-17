// Vite's ?raw import (a file's text as a string), for the source-scan tests
// under functions/. The app's own tsconfig gets this from vite/client.
declare module "*?raw" {
  const text: string;
  export default text;
}
