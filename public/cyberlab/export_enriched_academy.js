#!/usr/bin/env node
/*
 * Export the runtime-enriched Academy catalogue back to JSON modules.
 *
 * lessons.js is the compatibility source for the browser reader. This script
 * executes it in a sandbox, captures the enriched window.ACADEMY_COURSES value,
 * and writes lessons_dump.json plus data/courses/*.json for content review.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const source = path.join(root, "lessons.js");
const courseDir = path.join(root, "data", "courses");
const indexPath = path.join(root, "data", "course-index.json");
const dumpPath = path.join(root, "lessons_dump.json");

const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(source, "utf8"), context, { filename: source });

const courses = context.window.ACADEMY_COURSES || [];
fs.mkdirSync(courseDir, { recursive: true });
fs.writeFileSync(dumpPath, JSON.stringify(courses, null, 2) + "\n", "utf8");

const index = courses.map((course, order) => {
  const filePath = path.join(courseDir, `${course.id}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify({ schema: "cyberlab-course/v1", order, course }, null, 2) + "\n",
    "utf8",
  );
  return {
    id: course.id,
    module: course.module,
    trackId: course.trackId,
    trackTitle: course.trackTitle,
    lessons: course.lessons.length,
    path: path.relative(root, filePath),
  };
});

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log(`Exported ${courses.length} enriched course modules.`);
