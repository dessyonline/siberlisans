import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne } from "./mysql.server";
import {
  getAllCourses,
  getCourseWithLessons,
  getLessonById,
  checkQuizScore,
  verifyFlagSubmission,
  getAllToolsList,
  type CyberlabCourseSummary,
} from "./cyberlab-data.server";

function getRankTitle(xp: number): string {
  if (xp < 200) return "Çaylak Hacker";
  if (xp < 600) return "Sistem Gözcüsü";
  if (xp < 1200) return "Ağ Analisti";
  if (xp < 2500) return "Güvenlik Operatörü";
  if (xp < 5000) return "Siber Mühendis";
  if (xp < 10000) return "Kıdemli Pentester";
  return "Siber Muhafız (Elit)";
}

export const listAcademyCourses = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<{ courses: CyberlabCourseSummary[]; userXp: number; completedCount: number }> => {
    const courses = getAllCourses();
    let completedSet = new Set<string>();
    let userXp = 0;

    const userId = (context as any)?.userId;
    if (userId) {
      try {
        const rows = await mysqlQuery<{ lesson_key: string; xp: number }>(
          "SELECT lesson_key, xp FROM cyberlab_user_progress WHERE user_id=?",
          [userId]
        );
        rows.forEach((r) => {
          completedSet.add(r.lesson_key);
          userXp += Number(r.xp || 0);
        });
      } catch {}
    }

    const enriched = courses.map((c) => {
      // Calculate how many lessons of this course are completed
      return {
        ...c,
        completedLessons: 0, // will be mapped by client if needed or by course prefix
      };
    });

    return { courses: enriched, userXp, completedCount: completedSet.size };
  }
);

export const getAcademyCourse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ courseId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const course = getCourseWithLessons(data.courseId);
    if (!course) throw new Error("Kurs bulunamadı");

    const userId = (context as any)?.userId;
    let completedSet = new Set<string>();

    if (userId) {
      try {
        const rows = await mysqlQuery<{ lesson_key: string }>(
          "SELECT lesson_key FROM cyberlab_user_progress WHERE user_id=?",
          [userId]
        );
        rows.forEach((r) => completedSet.add(r.lesson_key));
      } catch {}
    }

    const lessonsWithStatus = course.lessons.map((l) => ({
      ...l,
      completed: completedSet.has(`${course.id}:${l.id}`),
    }));

    return { ...course, lessons: lessonsWithStatus };
  });

export const getAcademyLesson = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ courseId: z.string(), lessonId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const lesson = getLessonById(data.courseId, data.lessonId);
    if (!lesson) throw new Error("Ders bulunamadı");

    const userId = (context as any)?.userId;
    const lessonKey = `${data.courseId}:${data.lessonId}`;
    let isCompleted = false;
    let quizPassed = false;
    let bestScore = 0;
    let flagCaptured = false;

    if (userId) {
      try {
        const [prog, quiz, flag] = await Promise.all([
          mysqlOne<{ lesson_key: string }>(
            "SELECT lesson_key FROM cyberlab_user_progress WHERE user_id=? AND lesson_key=? LIMIT 1",
            [userId, lessonKey]
          ),
          mysqlOne<{ best_score: number; passed_at: string | null }>(
            "SELECT best_score, passed_at FROM cyberlab_quiz_attempts WHERE user_id=? AND lesson_key=? LIMIT 1",
            [userId, lessonKey]
          ),
          mysqlOne<{ lesson_key: string }>(
            "SELECT lesson_key FROM cyberlab_user_flags WHERE user_id=? AND lesson_key=? LIMIT 1",
            [userId, lessonKey]
          ),
        ]);

        isCompleted = !!prog;
        if (quiz) {
          bestScore = Number(quiz.best_score || 0);
          quizPassed = !!quiz.passed_at;
        }
        flagCaptured = !!flag;
      } catch {}
    }

    return {
      ...lesson,
      completed: isCompleted,
      quizPassed,
      bestScore,
      flagCaptured,
    };
  });

export const completeAcademyLesson = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ courseId: z.string(), lessonId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const lessonKey = `${data.courseId}:${data.lessonId}`;
    const lesson = getLessonById(data.courseId, data.lessonId);
    const xp = lesson?.xp || 60;

    await mysqlQuery(
      `INSERT INTO cyberlab_user_progress (user_id, lesson_key, xp, completed_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE completed_at=NOW()`,
      [userId, lessonKey, xp]
    ).catch(async () => {
      // Fallback if duplicate key without ON DUPLICATE KEY UPDATE
      await mysqlQuery(
        `INSERT IGNORE INTO cyberlab_user_progress (user_id, lesson_key, xp, completed_at) VALUES (?, ?, ?, NOW())`,
        [userId, lessonKey, xp]
      );
    });

    return { ok: true, awardedXp: xp };
  });

export const submitAcademyQuiz = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: unknown) =>
      z
        .object({
          courseId: z.string(),
          lessonId: z.string(),
          answers: z.record(z.number()),
        })
        .parse(d)
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const lessonKey = `${data.courseId}:${data.lessonId}`;
    const result = checkQuizScore(lessonKey, data.answers);

    if (result.passed) {
      await mysqlQuery(
        `INSERT INTO cyberlab_quiz_attempts (user_id, lesson_key, attempts, best_score, passed_at)
         VALUES (?, ?, 1, ?, NOW())
         ON DUPLICATE KEY UPDATE attempts = attempts + 1, best_score = GREATEST(best_score, ?), passed_at = NOW()`,
        [userId, lessonKey, result.score, result.score]
      ).catch(() => {});
    } else {
      await mysqlQuery(
        `INSERT INTO cyberlab_quiz_attempts (user_id, lesson_key, attempts, best_score, passed_at)
         VALUES (?, ?, 1, ?, NULL)
         ON DUPLICATE KEY UPDATE attempts = attempts + 1, best_score = GREATEST(best_score, ?)`,
        [userId, lessonKey, result.score, result.score]
      ).catch(() => {});
    }

    return result;
  });

export const submitAcademyFlag = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: unknown) =>
      z.object({ courseId: z.string(), lessonId: z.string(), flag: z.string() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const lessonKey = `${data.courseId}:${data.lessonId}`;
    const isValid = verifyFlagSubmission(data.lessonId, data.flag);

    if (!isValid) {
      return { success: false, message: "Hatalı bayrak! İpuçlarını ve laboratuvar çıktısını tekrar kontrol edin." };
    }

    await mysqlQuery(
      `INSERT IGNORE INTO cyberlab_user_flags (user_id, lesson_key, captured_at) VALUES (?, ?, NOW())`,
      [userId, lessonKey]
    ).catch(() => {});

    // Award bonus 100 XP
    await mysqlQuery(
      `INSERT INTO cyberlab_user_progress (user_id, lesson_key, xp, completed_at)
       VALUES (?, ?, 100, NOW())
       ON DUPLICATE KEY UPDATE xp = xp + 100`,
      [userId, `${lessonKey}:flag`]
    ).catch(() => {});

    return { success: true, message: "Tebrikler! Bayrak doğrulandı ve 100 XP hesabınıza eklendi!" };
  });

export const getAcademyProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    const [progRows, quizCountRow, flagCountRow] = await Promise.all([
      mysqlQuery<{ xp: number }>("SELECT xp FROM cyberlab_user_progress WHERE user_id=?", [userId]),
      mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM cyberlab_quiz_attempts WHERE user_id=? AND passed_at IS NOT NULL",
        [userId]
      ),
      mysqlOne<{ c: number }>("SELECT COUNT(*) c FROM cyberlab_user_flags WHERE user_id=?", [userId]),
    ]);

    const totalXp = progRows.reduce((s, r) => s + Number(r.xp || 0), 0);
    const completedLessons = progRows.length;
    const passedQuizzes = Number(quizCountRow?.c ?? 0);
    const capturedFlags = Number(flagCountRow?.c ?? 0);
    const rankTitle = getRankTitle(totalXp);

    const badges = [
      { id: "first_lesson", name: "İlk Adım", desc: "İlk siber güvenlik dersini tamamladın.", earned: completedLessons >= 1 },
      { id: "first_quiz", name: "Quiz Ustası", desc: "İlk sınavını başarıyla geçtin.", earned: passedQuizzes >= 1 },
      { id: "first_flag", name: "İlk Bayrak (CTF)", desc: "İlk laboratuvar bayrağını yakaladın.", earned: capturedFlags >= 1 },
      { id: "flag_hunter", name: "Bayrak Avcısı", desc: "5 farklı CTF bayrağı yakaladın.", earned: capturedFlags >= 5 },
      { id: "veteran", name: "Siber Muhafız", desc: "2.000 XP barajını aştın.", earned: totalXp >= 2000 },
    ];

    return {
      totalXp,
      rankTitle,
      completedLessons,
      passedQuizzes,
      capturedFlags,
      badges,
    };
  });

export const listAcademyTools = createServerFn({ method: "GET" }).handler(async () => {
  return getAllToolsList();
});
