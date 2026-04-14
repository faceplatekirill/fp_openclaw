import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { renderChatMarkdown } from './chat-renderer.js';
const requireForSkills = createRequire(import.meta.url);
function normalizeWorkspaceDir(options) {
    const configuredWorkspace = options.apiConfig
        ?.agents?.defaults?.workspace;
    if (typeof options.workspaceDir === 'string' && options.workspaceDir.trim().length > 0) {
        return path.resolve(options.workspaceDir);
    }
    if (typeof configuredWorkspace === 'string' &&
        configuredWorkspace.trim().length > 0) {
        return path.resolve(configuredWorkspace);
    }
    return process.cwd();
}
function validateSkillName(skill) {
    if (typeof skill !== 'string' || skill.trim().length === 0) {
        throw new Error('rejected skill "<empty>": skill is required');
    }
    if (skill.trim() !== skill) {
        throw new Error(`rejected skill "${skill}": leading and trailing whitespace is not allowed`);
    }
    if (path.isAbsolute(skill) || skill.includes('..') || /[\\/]/.test(skill)) {
        throw new Error(`rejected skill "${skill}": invalid skill path`);
    }
    return skill;
}
function validateParams(params) {
    if (params === undefined || params === null) {
        return {};
    }
    if (typeof params !== 'object' || Array.isArray(params)) {
        throw new Error('invalid params: expected a JSON object');
    }
    return params;
}
function validateFormat(format) {
    if (format === undefined) {
        return 'chat';
    }
    if (format === 'json' || format === 'chat') {
        return format;
    }
    throw new Error(`invalid format: ${String(format)}`);
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isSubPath(parentDir, childDir) {
    const relative = path.relative(parentDir, childDir);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function resolveSkillPaths(skill, options) {
    const workspaceDir = normalizeWorkspaceDir(options);
    const skillsDir = path.resolve(workspaceDir, 'skills');
    const skillDir = path.resolve(skillsDir, skill);
    const modulePath = path.join(skillDir, 'index.js');
    if (!isSubPath(skillsDir, skillDir)) {
        throw new Error(`rejected skill "${skill}": invalid skill path`);
    }
    if (!fs.existsSync(modulePath)) {
        throw new Error(`unknown skill "${skill}": module not found at ${modulePath}`);
    }
    return { workspaceDir, skillsDir, skillDir, modulePath };
}
function clearSkillModuleCache(skillDir) {
    for (const cacheKey of Object.keys(requireForSkills.cache)) {
        if (cacheKey === skillDir || cacheKey.startsWith(`${skillDir}${path.sep}`)) {
            delete requireForSkills.cache[cacheKey];
        }
    }
}
function loadSkillModule(modulePath, skill) {
    const loaded = requireForSkills(modulePath);
    const candidate = loaded?.default ?? loaded;
    if (typeof candidate !== 'function') {
        throw new Error(`rejected skill "${skill}": module ${modulePath} must export an async function`);
    }
    return candidate;
}
export async function runSkill(request, options) {
    try {
        const skill = validateSkillName(request.skill);
        const params = validateParams(request.params);
        const format = validateFormat(request.format);
        const { skillDir, modulePath } = resolveSkillPaths(skill, options);
        clearSkillModuleCache(skillDir);
        const skillModule = loadSkillModule(modulePath, skill);
        const viewModel = await skillModule({
            client: options.client,
            indexRegistry: options.indexRegistry,
            params,
        });
        if (format === 'json') {
            return JSON.stringify(viewModel, null, 2);
        }
        return renderChatMarkdown(viewModel);
    }
    catch (error) {
        throw new Error(`Skill run error: ${toErrorMessage(error)}`);
    }
}
//# sourceMappingURL=skill-runner.js.map