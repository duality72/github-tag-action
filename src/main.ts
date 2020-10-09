import * as core from "@actions/core";
import { exec as _exec } from "@actions/exec";
import { context, GitHub } from "@actions/github";
import { coerce, gt, inc, valid, ReleaseType } from "semver";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";

const HASH_SEPARATOR = "|commit-hash:";
const SEPARATOR = "==============================================";
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
  if (!validVersions) {
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
  } catch (error) {
    core.setFailed(error.message);
  }

  //   const defaultBump = core.getInput("default_bump") as ReleaseType | "false";
  //   const tagPrefix = core.getInput("tag_prefix");
  //   const customTag = core.getInput("custom_tag")
  //   const releaseBranches = core.getInput("release_branches");
  //   const createAnnotatedTag = core.getInput("create_annotated_tag");
  //   const dryRun = core.getInput("dry_run");
  //
  //
  //   if (!GITHUB_REF) {
  //     core.setFailed("Missing GITHUB_REF");
  //     return;
  //   }
  //
  //   const preRelease = releaseBranches
  //     .split(",")
  //     .every((branch) => !GITHUB_REF.replace("refs/heads/", "").match(branch));
  //
  //   await exec("git fetch --tags");
  //
  //   const hasTag = !!(await exec("git tag")).stdout.trim();
  //   let tag = "";
  //   let logs = "";
  //
  //   if (hasTag) {
  //     const previousTagSha = (
  //       await exec("git rev-list --tags --topo-order --max-count=1")
  //     ).stdout.trim();
  //     tag = (await exec(`git describe --tags ${previousTagSha}`)).stdout.trim();
  //     logs = (
  //       await exec(
  //         `git log ${tag}..HEAD --pretty=format:'%s%n%b${HASH_SEPARATOR}%h${SEPARATOR}' --abbrev-commit`
  //       )
  //     ).stdout.trim();
  //
  //     core.debug(`Setting previous_tag to: ${tag}`);
  //     core.setOutput("previous_tag", tag);
  //
  //     if (previousTagSha === GITHUB_SHA) {
  //       core.debug("No new commits since previous tag. Skipping...");
  //       return;
  //     }
  //   } else {
  //     tag = "0.0.0";
  //     logs = (
  //       await exec(
  //         `git log --pretty=format:'%s%n%b${HASH_SEPARATOR}%h${SEPARATOR}' --abbrev-commit`
  //       )
  //     ).stdout.trim();
  //     core.setOutput("previous_tag", tag);
  //   }
  //
  //   // for some reason the commits start and end with a `'` on the CI so we ignore it
  //   const commits = logs
  //     .split(SEPARATOR)
  //     .map((x) => {
  //       const data = x.trim().replace(/^'\n'/g, "").replace(/^'/g, "");
  //       if (!data) {
  //         return {};
  //       }
  //       const [message, hash] = data.split(HASH_SEPARATOR);
  //       return {
  //         message: message.trim(),
  //         hash: hash.trim(),
  //       };
  //     })
  //     .filter((x) => !!x.message);
  //   const bump = await analyzeCommits(
  //     {},
  //     { commits, logger: { log: console.info.bind(console) } }
  //   );
  //
  //   if (!bump && defaultBump === "false") {
  //     core.debug("No commit specifies the version bump. Skipping...");
  //     return;
  //   }
  //
  //   let newVersion = "";
  //   if (!customTag) {
  //     newVersion = `${inc(tag, bump || defaultBump)}${
  //       preRelease ? `-${GITHUB_SHA.slice(0, 7)}` : ""
  //     }`;
  //   } else {
  //     newVersion = customTag;
  //   }
  //   const newTag = `${tagPrefix}${newVersion}`;
  //
  //   core.setOutput("new_version", newVersion);
  //   core.setOutput("new_tag", newTag);
  //
  //   core.debug(`New tag: ${newTag}`);
  //
  //   const changelog = await generateNotes(
  //     {},
  //     {
  //       commits,
  //       logger: { log: console.info.bind(console) },
  //       options: {
  //         repositoryUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}`,
  //       },
  //       lastRelease: { gitTag: tag },
  //       nextRelease: { gitTag: newTag, version: newVersion },
  //     }
  //   );
  //
  //   core.setOutput("changelog", changelog);
  //
  //   if (preRelease) {
  //     core.debug(
  //       "This branch is not a release branch. Skipping the tag creation."
  //     );
  //     return;
  //   }
  //
  //   const tagAlreadyExists = !!(
  //     await exec(`git tag -l "${newTag}"`)
  //   ).stdout.trim();
  //
  //   if (tagAlreadyExists) {
  //     core.debug("This tag already exists. Skipping the tag creation.");
  //     return;
  //   }
  //
  //
  //   const octokit = new GitHub(core.getInput("github_token"));
  //
  //   if (createAnnotatedTag === "true") {
  //     core.debug(`Creating annotated tag`);
  //
  //     const tagCreateResponse = await octokit.git.createTag({
  //       ...context.repo,
  //       tag: newTag,
  //       message: newTag,
  //       object: GITHUB_SHA,
  //       type: "commit",
  //     });
  //
  //     core.debug(`Pushing annotated tag to the repo`);
  //
  //     await octokit.git.createRef({
  //       ...context.repo,
  //       ref: `refs/tags/${newTag}`,
  //       sha: tagCreateResponse.data.sha,
  //     });
  //     return;
  //   }
  //
  //   core.debug(`Pushing new tag to the repo`);
  //
  //   await octokit.git.createRef({
  //     ...context.repo,
  //     ref: `refs/tags/${newTag}`,
  //     sha: GITHUB_SHA,
  //   });
}

run();
