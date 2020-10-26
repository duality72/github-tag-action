import * as core from "@actions/core";
import { exec as _exec } from "@actions/exec";
import { context, GitHub } from "@actions/github";
import { coerce, gt, inc, valid, ReleaseType } from "semver";

const VERSION_PREFIX = '-v'
const DEFAULT_VERSION = '0.0.0';
const RELEASE_TYPES = ['major', 'minor', 'patch']

class AffirmVersion {
  tag: string
  version

  constructor(tag, version) {
    this.tag = tag;
    this.version = version;
  }
}

async function exec(command: string, args?: string[]) {
  let stdout = "";
  let stderr = "";

  try {
   core.debug(`Executing command: ${command}`);
   const options = {
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString();
        },
        stderr: (data: Buffer) => {
          stderr += data.toString();
        },
      },
    };

    const code = await _exec(command, args, options);

    return {
      code,
      stdout,
      stderr,
    };
  } catch (err) {
    core.debug(`Caught error: ${err}`);
    return {
      code: 1,
      stdout,
      stderr,
      error: err,
    };
  } finally {
    core.debug(`Stdout: ${stdout}`);
    core.debug(`Stderr: ${stderr}`);
  }
}

async function get_version_tags_for_DT(deployable_target: any) {
  let tags: string[] = [];
  await exec("git fetch --tags");
  tags = (await exec('git', ['tag', '--list', `${deployable_target}${VERSION_PREFIX}*`])).stdout.split("\n");
  // Make sure version tag only ends with periods and digits
  tags = tags.filter(x => x.match(/-v[\.\d]+$/));
  core.debug(`Tags found: ${tags}`);
  return tags;
}

async function get_highest_version_for_DT(deployable_target: string) {
  let tags = await get_version_tags_for_DT(deployable_target);
  // Remove the DT+version prefix and coerce into a semantic version
  let versions = tags.map(x => new AffirmVersion(x, coerce(x.slice(deployable_target.length + VERSION_PREFIX.length))));
  core.debug(`All versions found: ${versions.map(x => x.version)}`);
  let validVersions = versions.filter(x => valid(x.version));
  core.debug(`Valid versions found: ${validVersions.map(x => x.version)}`);
  if (validVersions.length == 0) {
    return new AffirmVersion(`${deployable_target}${VERSION_PREFIX}${DEFAULT_VERSION}`, coerce(DEFAULT_VERSION));
  }
  let highestVersion = validVersions.pop()!;
  for (let version of validVersions) {
    core.debug(`Comparing: ${version.version} ${highestVersion.version}`);
    if (gt(version.version, highestVersion.version)) { highestVersion = version; }
  }
  core.debug(`Highest version found: ${highestVersion.version}`);
  return highestVersion;
}

async function run() {
  try {
    const { GITHUB_SHA } = process.env;
    if (!GITHUB_SHA) {
      core.setFailed("Missing GITHUB_SHA");
      return;
    }

    const deployableTarget = core.getInput("deployable_target");
    let lastVersion = await get_highest_version_for_DT(deployableTarget);
    if (!lastVersion) {
      core.setFailed(`No last version found for deployable target ${deployableTarget}`);
      return;
    }
    core.setOutput("previous_version", lastVersion);

    let bumpType = RELEASE_TYPES[(lastVersion.tag.match(/\./g) || []).length];
    core.debug(`Bump type: ${bumpType}`);
    let newVersion = `${inc(lastVersion.version, bumpType as ReleaseType)}`;
    while (newVersion.endsWith('.0')) {
      newVersion = newVersion.slice(0, -2);
    }
    core.setOutput("new_version", newVersion);

    let newTag = `${deployableTarget}${VERSION_PREFIX}${newVersion}`;
    core.setOutput("new_tag", newTag);

    const dryRun = core.getInput("dry_run");
    if (/true/i.test(dryRun)) {
      core.info("Dry run: not performing tag action.");
      return;
    }

    const octokit = new GitHub(core.getInput("github_token"));
    core.debug(`Pushing new tag to the repo`);
    await octokit.git.createRef({
      ...context.repo,
      ref: `refs/tags/${newTag}`,
      sha: GITHUB_SHA,
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
