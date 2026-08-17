#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = resolve(scriptDirectory, '../..');

function parseArguments(arguments_) {
  let workspaceRoot = defaultWorkspaceRoot;
  const files = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--root') {
      const value = arguments_[index + 1];
      if (!value) throw new Error('--root requires a directory');
      workspaceRoot = resolve(value);
      index += 1;
    } else {
      files.push(argument);
    }
  }

  return { workspaceRoot, files };
}

function trackedMarkdownFiles(workspaceRoot) {
  const output = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

function markdownWithoutCode(source) {
  return source.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, '').replace(/`[^`\n]*`/g, '');
}

function linkDestinations(source) {
  const destinations = [];
  const markdown = markdownWithoutCode(source);
  const inlineLink = /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+[^)]*)?\)/g;
  const referenceLink = /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm;

  for (const pattern of [inlineLink, referenceLink]) {
    for (const match of markdown.matchAll(pattern)) destinations.push(match[1]);
  }

  return destinations;
}

function localTarget(destination) {
  let target = destination.startsWith('<') ? destination.slice(1, -1) : destination;
  target = target.replace(/[?#].*$/, '');

  if (
    !target ||
    target.startsWith('#') ||
    target.startsWith('/') ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.includes('{{')
  ) {
    return null;
  }

  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

export function validateMarkdownLinks(workspaceRoot, files) {
  const failures = [];

  for (const file of files) {
    const absoluteFile = isAbsolute(file) ? file : resolve(workspaceRoot, file);
    const source = readFileSync(absoluteFile, 'utf8');

    for (const destination of linkDestinations(source)) {
      const target = localTarget(destination);
      if (!target) continue;

      const absoluteTarget = resolve(dirname(absoluteFile), target);
      const workspaceRelativeTarget = relative(workspaceRoot, absoluteTarget);
      if (
        workspaceRelativeTarget === '..' ||
        workspaceRelativeTarget.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      ) {
        failures.push(
          `${relative(workspaceRoot, absoluteFile)}: ${destination} escapes the workspace`,
        );
      } else if (!existsSync(absoluteTarget)) {
        failures.push(`${relative(workspaceRoot, absoluteFile)}: ${destination} does not exist`);
      }
    }
  }

  return failures;
}

const { workspaceRoot, files: requestedFiles } = parseArguments(process.argv.slice(2));
const files = requestedFiles.length > 0 ? requestedFiles : trackedMarkdownFiles(workspaceRoot);
const failures = validateMarkdownLinks(workspaceRoot, files);

if (failures.length > 0) {
  console.error(
    ['Broken local Markdown links:', ...failures.map((failure) => `- ${failure}`)].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(`Validated local links in ${files.length} Markdown files.`);
}
