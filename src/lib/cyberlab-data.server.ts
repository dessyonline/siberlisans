import fs from "fs";
import path from "path";
import crypto from "crypto";

export type CyberlabCourseSummary = {
  id: string;
  title: string;
  description: string;
  level: string;
  category: string;
  emoji: string;
  color: string;
  order: number;
  totalLessons: number;
  totalXp: number;
  completedLessons?: number;
};

export type CyberlabLessonItem = {
  id: string;
  order: number;
  title: string;
  summary: string;
  level: string;
  duration: string;
  xp: number;
  completed?: boolean;
};

export type CyberlabLessonFull = CyberlabLessonItem & {
  courseId: string;
  courseTitle: string;
  outcomes: string[];
  sections: { title: string; content: string }[];
  commands: { cmd: string; desc: string }[];
  exercise?: string;
  safety?: string;
  masteryRubric?: string[];
  hasFlag: boolean;
  flagHint?: string;
  flagCaptured?: boolean;
  quizQuestions: { id: number; question: string; options: string[] }[];
  quizPassed?: boolean;
  bestScore?: number;
};

export type CyberlabTool = {
  cat: string;
  tag: string;
  tool: string;
  name: string;
  desc: string;
  cmd: string;
  param?: string;
};

let cachedCourses: any[] | null = null;
let cachedQuizzes: Record<string, any[]> | null = null;
let cachedFlags: Record<string, { hash: string; hint: string }> | null = null;
let cachedTools: CyberlabTool[] | null = null;

function loadData() {
  const dataDir = path.join(process.cwd(), "src/lib/cyberlab-data");

  if (!cachedCourses) {
    const raw = fs.readFileSync(path.join(dataDir, "courses.json"), "utf-8");
    cachedCourses = JSON.parse(raw);
  }
  if (!cachedQuizzes) {
    const raw = fs.readFileSync(path.join(dataDir, "quizzes.json"), "utf-8");
    cachedQuizzes = JSON.parse(raw);
  }
  if (!cachedFlags) {
    const raw = fs.readFileSync(path.join(dataDir, "flags.json"), "utf-8");
    cachedFlags = JSON.parse(raw);
  }
  if (!cachedTools) {
    const raw = fs.readFileSync(path.join(dataDir, "tools.json"), "utf-8");
    cachedTools = JSON.parse(raw);
  }
}

export function getAllCourses(): CyberlabCourseSummary[] {
  loadData();
  return (cachedCourses ?? []).map((c: any) => {
    const lessons = c.lessons || [];
    const totalXp = lessons.reduce((s: number, l: any) => s + (l.xp || 50), 0);
    return {
      id: c.id,
      title: c.module || c.trackTitle || c.id,
      description: c.description || "",
      level: c.level || "Başlangıç",
      category: c.category || "Genel",
      emoji: c.moduleEmoji || "🛡️",
      color: c.moduleColor || "#00ff88",
      order: c.pathOrder ?? 0,
      totalLessons: lessons.length,
      totalXp,
    };
  });
}

export function getCourseWithLessons(courseId: string) {
  loadData();
  const course = (cachedCourses ?? []).find((c: any) => c.id === courseId);
  if (!course) return null;

  const lessons: CyberlabLessonItem[] = (course.lessons || []).map((l: any, idx: number) => ({
    id: l.id,
    order: l.order ?? idx + 1,
    title: l.title,
    summary: l.summary || "",
    level: l.level || course.level || "Başlangıç",
    duration: l.duration || "20 dk",
    xp: l.xp || 60,
  }));

  return {
    id: course.id,
    title: course.module || course.id,
    description: course.description || "",
    level: course.level || "Başlangıç",
    category: course.category || "Genel",
    emoji: course.moduleEmoji || "🛡️",
    color: course.moduleColor || "#00ff88",
    lessons,
  };
}

export function getLessonById(courseId: string, lessonId: string): CyberlabLessonFull | null {
  loadData();
  const course = (cachedCourses ?? []).find((c: any) => c.id === courseId);
  if (!course) return null;

  const lesson = (course.lessons || []).find((l: any) => l.id === lessonId);
  if (!lesson) return null;

  const lessonKey = `${courseId}:${lessonId}`;
  const rawQuizzes = cachedQuizzes?.[lessonKey] || [];
  const flagInfo = cachedFlags?.[lessonId] || cachedFlags?.[lessonKey];

  return {
    id: lesson.id,
    order: lesson.order ?? 1,
    title: lesson.title,
    summary: lesson.summary || "",
    level: lesson.level || course.level || "Başlangıç",
    duration: lesson.duration || "20 dk",
    xp: lesson.xp || 60,
    courseId: course.id,
    courseTitle: course.module || course.id,
    outcomes: lesson.outcomes || [],
    sections: lesson.sections || [],
    commands: lesson.commands || [],
    exercise: lesson.exercise || "",
    safety: lesson.safety || "",
    masteryRubric: lesson.masteryRubric || [],
    hasFlag: !!flagInfo,
    flagHint: flagInfo?.hint,
    // Hide correct answers from client payload for security!
    quizQuestions: rawQuizzes.map((q: any) => ({
      id: q.id,
      question: q.question,
      options: q.options || [],
    })),
  };
}

export function checkQuizScore(
  lessonKey: string,
  userAnswers: Record<string, number>
): { score: number; total: number; passed: boolean; correctCount: number } {
  loadData();
  const rawQuizzes = cachedQuizzes?.[lessonKey] || [];
  if (!rawQuizzes.length) return { score: 100, total: 0, passed: true, correctCount: 0 };

  let correctCount = 0;
  rawQuizzes.forEach((q: any) => {
    const selected = userAnswers[String(q.id)];
    if (selected === q.correctIndex) {
      correctCount++;
    }
  });

  const score = Math.round((correctCount / rawQuizzes.length) * 100);
  const passed = score >= 70;
  return { score, total: rawQuizzes.length, passed, correctCount };
}

export function verifyFlagSubmission(lessonId: string, submittedFlag: string): boolean {
  loadData();
  const flagInfo = cachedFlags?.[lessonId];
  if (!flagInfo) return false;

  const clean = submittedFlag.trim();
  const hash = crypto.createHash("sha256").update(clean).digest("hex");
  return hash === flagInfo.hash;
}

export function getAllToolsList(): CyberlabTool[] {
  loadData();
  return cachedTools ?? [];
}
