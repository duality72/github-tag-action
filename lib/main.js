"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const semver_1 = require("semver");
const VERSION_PREFIX = '-v';
const DEFAULT_VERSION = '0.0.0';
const RELEASE_TYPES = ['major', 'minor', 'patch'];
class AffirmVersion {
    constructor(tag, version) {
        this.tag = tag;
        this.version = version;
    }
}
function exec(command, args) {
    return __awaiter(this, void 0, void 0, function* () {
        let stdout = "";
        let stderr = "";
        try {
            core.debug(`Executing command: ${command}`);
            const options = {
                listeners: {
                    stdout: (data) => {
                        stdout += data.toString();
                    },
                    stderr: (data) => {
                        stderr += data.toString();
                    },
                },
            };
            const code = yield exec_1.exec(command, args, options);
            return {
                code,
                stdout,
                stderr,
            };
        }
        catch (err) {
            core.debug(`Caught error: ${err}`);
            return {
                code: 1,
                stdout,
                stderr,
                error: err,
            };
        }
        finally {
            core.debug(`Stdout: ${stdout}`);
            core.debug(`Stderr: ${stderr}`);
        }
    });
}
function get_version_tags_for_DT(deployable_target) {
    return __awaiter(this, void 0, void 0, function* () {
        let tags = [];
        yield exec("git fetch --tags");
        tags = (yield exec('git', ['tag', '--list', `${deployable_target}${VERSION_PREFIX}*`])).stdout.split("\n");
        // Make sure version tag only ends with periods and digits
        tags = tags.filter(x => x.match(/-v[\.\d]+$/));
        core.debug(`Tags found: ${tags}`);
        return tags;
    });
}
function get_highest_version_for_DT(deployable_target) {
    return __awaiter(this, void 0, void 0, function* () {
        let tags = yield get_version_tags_for_DT(deployable_target);
        // Remove the DT+version prefix and coerce into a semantic version
        let versions = tags.map(x => new AffirmVersion(x, semver_1.coerce(x.slice(deployable_target.length + VERSION_PREFIX.length))));
        core.debug(`All versions found: ${versions.map(x => x.version)}`);
        let validVersions = versions.filter(x => semver_1.valid(x.version));
        core.debug(`Valid versions found: ${validVersions.map(x => x.version)}`);
        if (validVersions.length == 0) {
            return new AffirmVersion(`${deployable_target}${VERSION_PREFIX}${DEFAULT_VERSION}`, semver_1.coerce(DEFAULT_VERSION));
        }
        let highestVersion = validVersions.pop();
        for (let version of validVersions) {
            core.debug(`Comparing: ${version.version} ${highestVersion.version}`);
            if (semver_1.gt(version.version, highestVersion.version)) {
                highestVersion = version;
            }
        }
        core.debug(`Highest version found: ${highestVersion.version}`);
        return highestVersion;
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { GITHUB_SHA } = process.env;
            if (!GITHUB_SHA) {
                core.setFailed("Missing GITHUB_SHA");
                return;
            }
            const deployableTarget = core.getInput("deployable_target");
            let lastVersion = yield get_highest_version_for_DT(deployableTarget);
            if (!lastVersion) {
                core.setFailed(`No last version found for deployable target ${deployableTarget}`);
                return;
            }
            core.setOutput("previous_version", lastVersion);
            let bumpType = RELEASE_TYPES[(lastVersion.tag.match(/\./g) || []).length];
            core.debug(`Bump type: ${bumpType}`);
            let newVersion = `${semver_1.inc(lastVersion.version, bumpType)}`;
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
            const octokit = new github_1.GitHub(core.getInput("github_token"));
            core.debug(`Pushing new tag to the repo`);
            yield octokit.git.createRef(Object.assign(Object.assign({}, github_1.context.repo), { ref: `refs/tags/${newTag}`, sha: GITHUB_SHA }));
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
