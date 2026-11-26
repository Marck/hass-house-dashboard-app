// What this build says about itself, shown under Settings, About.
//
// This committed copy describes a plain checkout. The image build and
// scripts/serve.py replace it with real values (see scripts/build-info.mjs):
// the commit identifies a build, the tag says whether it was ever released,
// and "modified" says the commit named is not quite what is running.
// The version itself is written in one place, package.json.
export const BUILD = {
  version: '0.4.0',
  channel: 'dev',
  commit: '',
  modified: false,
  tag: '',
  builtOn: '',
};
