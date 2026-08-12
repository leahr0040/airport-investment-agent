import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 auto-generates AGENTS.md/CLAUDE.md on every dev/build run,
  // which would collide with the project's own committed .claude/CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
