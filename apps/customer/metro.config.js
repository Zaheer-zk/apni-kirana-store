const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so Metro can resolve shared packages
config.watchFolders = [workspaceRoot];

// Let Metro resolve from both app and workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure Metro uses the app's own metro-cache (not hoisted one)
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
