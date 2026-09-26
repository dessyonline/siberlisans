import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FlaskConical,
  ExternalLink,
  Lock,
  Clock,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Search,
  BookOpen,
  Play,
  ArrowRight,
  CheckCircle2,
  Zap,
  Award,
  Trophy,
  ChevronRight,
  Copy,
  Check,
  Filter,
  Layers,
  Code,
  Flag,
  Brain,
  AlertTriangle,
  Eye,
  HelpCircle,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { getCyberlabAccess } from "@/lib/cyberlab.functions";
import { listCyberlabProducts } from "@/lib/cyberlab-products.functions";
import {
  listAcademyCourses,
  getAcademyCourse,
  getAcademyLesson,
  completeAcademyLesson,
  submitAcademyQuiz,
  submitAcademyFlag,
  getAcademyProfile,
  listAcademyTools,
} from "@/lib/cyberlab-academy.functions";

const SITE_URL = "https://siberlisans.com";

export const Route = createFileRoute("/cyberlab")({
  component: CyberlabPage,
  head: () => ({
    meta: [
      { title: "CyberLab // Siber Güvenlik Akademisi & Laboratuvarı | SiberLisans" },
      {
        name: "description",
        content:
          "18 kapsamlı siber güvenlik kursu, 322 etkileşimli ders, 125 güvenlik ve OSINT aracı, CTF bayrak görevleri ve interaktif quizler. Siber güvenlik kariyerine tek tıkla başla.",
      },
      { property: "og:title", content: "CyberLab // Siber Güvenlik Akademisi & Laboratuvarı | SiberLisans" },
      {
        property: "og:description",
        content:
          "18 kurs, 322 ders, 125 OSINT aracı, interaktif quizler ve CTF görevleriyle siber güvenlik laboratuvarı.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/cyberlab` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/cyberlab` }],
  }),
});

function CyberlabPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"kurslar" | "ders" | "araclar" | "profil" | "paketler">("kurslar");

  // Selected Course and Lesson State
  const [selectedCourseId, setSelectedCourseId] = useState<string>("linux-basics");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("CYB01");

  // Fetch access & products
  const fetchAccess = useServerFn(getCyberlabAccess);
  const { data: access } = useQuery({
    queryKey: ["cyberlab-access-full", user?.id],
    queryFn: () => fetchAccess({ data: undefined as never }),
    enabled: !!user,
  });

  const fetchProducts = useServerFn(listCyberlabProducts);
  const { data: products } = useQuery({
    queryKey: ["cyberlab-products"],
    queryFn: () => fetchProducts(),
  });

  // Fetch Academy Profile & Courses
  const fetchProfile = useServerFn(getAcademyProfile);
  const { data: profile } = useQuery({
    queryKey: ["cyberlab-academy-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });

  const fetchCourses = useServerFn(listAcademyCourses);
  const { data: coursesData } = useQuery({
    queryKey: ["cyberlab-academy-courses", user?.id],
    queryFn: () => fetchCourses(),
  });

  const hasAccess = !!user && access?.active;

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 md:px-6 md:py-10 space-y-6">
      {/* CYBERLAB HERO & STUDENT HUD */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-card/90 via-card/70 to-primary/10 p-6 md:p-8 backdrop-blur-2xl shadow-2xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-cyan/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                CYBERLAB ACADEMY &amp; LAB
              </Badge>
              {profile?.rankTitle && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {profile.rankTitle}
                </Badge>
              )}
              {hasAccess ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-xs font-bold">
                  ● VIP ERİŞİM AKTİF
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warn/40 text-warn font-mono text-xs">
                  ÜCRETSİZ BAŞLANGIÇ MODU
                </Badge>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
              <FlaskConical className="h-8 w-8 text-primary shrink-0" />
              <span>CyberLab Siber Güvenlik Laboratuvarı</span>
            </h1>

            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              18 kapsamlı kurs, 322 adım adım ders, 125 gerçek siber güvenlik ve OSINT aracı, interaktif quizler ve CTF bayrak görevleri.
            </p>
          </div>

          {/* Student Status HUD */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-border/80 bg-background/80 p-4 backdrop-blur-md flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Kazanılan Tecrübe</div>
                <div className="font-mono text-xl font-bold text-foreground">
                  {profile?.totalXp ?? coursesData?.userXp ?? 0} <span className="text-xs text-primary font-normal">XP</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-background/80 p-4 backdrop-blur-md flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan/15 text-cyan border border-cyan/20">
                <Flag className="h-5 w-5" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Bayraklar (CTF)</div>
                <div className="font-mono text-xl font-bold text-foreground">
                  {profile?.capturedFlags ?? 0} <span className="text-xs text-cyan font-normal">Adet</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="mt-6 pt-5 border-t border-border/60 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-foreground">
              <BookOpen className="h-4 w-4 text-primary" /> 18 Kurs &amp; 322 Modül
            </span>
            <span className="flex items-center gap-1.5 text-foreground">
              <Code className="h-4 w-4 text-cyan" /> 125 Siber Araç
            </span>
            <span className="flex items-center gap-1.5 text-foreground">
              <Brain className="h-4 w-4 text-emerald-400" /> 1.288 İnteraktif Quiz Sorusu
            </span>
          </div>

          {!hasAccess && (
            <button
              onClick={() => setActiveTab("paketler")}
              className="text-primary hover:underline flex items-center gap-1"
            >
              Tam erişim paketlerini incele <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </section>

      {/* NAVIGATION TABS */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-xl">
        {[
          { key: "kurslar", label: "Eğitim Akademisi (18 Kurs)", icon: BookOpen },
          { key: "ders", label: "Etkileşimli Ders Odası", icon: Terminal, badge: "Canlı Lab" },
          { key: "araclar", label: "Siber Araç Kütüphanesi (125)", icon: Code },
          { key: "profil", label: "Başarı & Rozetler", icon: Award },
          { key: "paketler", label: "VIP Erişim Paketleri", icon: Sparkles },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-mono text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? "border border-primary/40 bg-primary/15 text-primary shadow-sm shadow-primary/10"
                  : "text-muted-foreground hover:bg-card hover:text-foreground border border-transparent"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              <span>{t.label}</span>
              {t.badge && (
                <span className={`rounded-full px-1.5 py-0.2 text-[9px] uppercase font-bold tracking-wider ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT VIEWS */}
      <div>
        {activeTab === "kurslar" && (
          <CoursesView
            courses={coursesData?.courses ?? []}
            onSelectCourse={(courseId) => {
              setSelectedCourseId(courseId);
              // Set first lesson of this course as default
              setSelectedLessonId("CYB01");
              setActiveTab("ders");
            }}
          />
        )}

        {activeTab === "ders" && (
          <LessonRoomView
            courseId={selectedCourseId}
            lessonId={selectedLessonId}
            courses={coursesData?.courses ?? []}
            onSelectLesson={(cId, lId) => {
              setSelectedCourseId(cId);
              setSelectedLessonId(lId);
            }}
          />
        )}

        {activeTab === "araclar" && <ToolsView />}

        {activeTab === "profil" && (
          <ProfileView profile={profile} user={user} />
        )}

        {activeTab === "paketler" && (
          <PackagesView products={products ?? []} access={access} />
        )}
      </div>
    </div>
  );
}

// ==========================================
// 1. KURSLAR & MÜFREDAT VIEW
// ==========================================

function CoursesView({
  courses,
  onSelectCourse,
}: {
  courses: any[];
  onSelectCourse: (courseId: string) => void;
}) {
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase());
      const matchLevel = levelFilter === "all" || c.level.includes(levelFilter);
      return matchSearch && matchLevel;
    });
  }, [courses, search, levelFilter]);

  return (
    <div className="space-y-6">
      {/* FILTER & SEARCH */}
      <div className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Kurs veya konu ara (örn. Linux, Burp, WiFi, Web)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 font-mono text-sm h-10 rounded-xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {["all", "Başlangıç", "Orta", "İleri"].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs transition-colors ${
                levelFilter === lvl
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-background/60 text-muted-foreground hover:text-foreground border border-border/60"
              }`}
            >
              {lvl === "all" ? "Tüm Seviyeler" : lvl}
            </button>
          ))}
        </div>
      </div>

      {/* COURSES GRID */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((course) => (
          <div
            key={course.id}
            className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl flex flex-col justify-between space-y-4 hover:border-primary/40 hover:-translate-y-1 transition-all duration-300 shadow-xl"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{course.emoji}</span>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {course.level}
                  </Badge>
                </div>
                <span className="font-mono text-xs font-bold text-primary flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" /> +{course.totalXp} XP
                </span>
              </div>

              <h3 className="font-bold text-lg text-foreground leading-snug line-clamp-2">
                {course.title}
              </h3>

              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                {course.description}
              </p>
            </div>

            <div className="pt-4 border-t border-border/40 flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" /> {course.totalLessons} Modül Ders
              </span>

              <Button
                size="sm"
                className="font-mono text-xs shadow-sm"
                onClick={() => onSelectCourse(course.id)}
              >
                Kursa Başla <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 2. ETKİLEŞİMLİ DERS ODASI & LAB VIEW
// ==========================================

function LessonRoomView({
  courseId,
  lessonId,
  courses,
  onSelectLesson,
}: {
  courseId: string;
  lessonId: string;
  courses: any[];
  onSelectLesson: (cId: string, lId: string) => void;
}) {
  const qc = useQueryClient();
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [flagInput, setFlagInput] = useState<string>("");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Fetch Course details (to list all lessons in sidebar)
  const fetchCourseFn = useServerFn(getAcademyCourse);
  const { data: courseData } = useQuery({
    queryKey: ["cyberlab-course-detail", courseId],
    queryFn: () => fetchCourseFn({ data: { courseId } }),
  });

  // Fetch Lesson details
  const fetchLessonFn = useServerFn(getAcademyLesson);
  const { data: lesson, isLoading } = useQuery({
    queryKey: ["cyberlab-lesson-detail", courseId, lessonId],
    queryFn: () => fetchLessonFn({ data: { courseId, lessonId } }),
  });

  // Complete Lesson mutation
  const completeFn = useServerFn(completeAcademyLesson);
  const completeMut = useMutation({
    mutationFn: () => completeFn({ data: { courseId, lessonId } }),
    onSuccess: (res) => {
      toast.success(`Ders tamamlandı! +${res.awardedXp} XP kazandınız!`);
      qc.invalidateQueries({ queryKey: ["cyberlab-lesson-detail", courseId, lessonId] });
      qc.invalidateQueries({ queryKey: ["cyberlab-academy-profile"] });
      qc.invalidateQueries({ queryKey: ["cyberlab-course-detail", courseId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Submit Quiz mutation
  const submitQuizFn = useServerFn(submitAcademyQuiz);
  const quizMut = useMutation({
    mutationFn: () => submitQuizFn({ data: { courseId, lessonId, answers: selectedAnswers } }),
    onSuccess: (res) => {
      if (res.passed) {
        toast.success(`Tebrikler! Sınavı %${res.score} başarıyla geçtiniz!`);
      } else {
        toast.error(`Puanınız: %${res.score}. Quizi geçmek için en az %70 almalısınız.`);
      }
      qc.invalidateQueries({ queryKey: ["cyberlab-lesson-detail", courseId, lessonId] });
      qc.invalidateQueries({ queryKey: ["cyberlab-academy-profile"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Submit Flag mutation
  const submitFlagFn = useServerFn(submitAcademyFlag);
  const flagMut = useMutation({
    mutationFn: () => submitFlagFn({ data: { courseId, lessonId, flag: flagInput } }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message);
        setFlagInput("");
        qc.invalidateQueries({ queryKey: ["cyberlab-lesson-detail", courseId, lessonId] });
        qc.invalidateQueries({ queryKey: ["cyberlab-academy-profile"] });
      } else {
        toast.error(res.message);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    toast.success("Komut panoya kopyalandı!");
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* SIDEBAR: LESSONS CURRICULUM */}
      <div className="lg:col-span-4 space-y-4">
        <div className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl shadow-xl space-y-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Aktif Kurs</span>
            <h3 className="font-bold text-base text-foreground mt-0.5 line-clamp-1">
              {courseData?.title ?? courseId}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {courseData?.description}
            </p>
          </div>

          {/* Quick Course Switcher Dropdown */}
          <div className="pt-2 border-t border-border/40">
            <label className="font-mono text-[11px] text-muted-foreground mb-1 block">Kurs Değiştir:</label>
            <select
              value={courseId}
              onChange={(e) => {
                const newCourse = courses.find((c) => c.id === e.target.value);
                if (newCourse) {
                  onSelectLesson(newCourse.id, "CYB01");
                }
              }}
              className="w-full rounded-xl border border-border/70 bg-background/80 px-3 py-2 font-mono text-xs text-foreground"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Lesson List */}
          <div className="space-y-1.5 pt-2 max-h-[500px] overflow-y-auto pr-1">
            {(courseData?.lessons ?? []).map((l: any) => {
              const isActive = l.id === lessonId;
              return (
                <button
                  key={l.id}
                  onClick={() => onSelectLesson(courseId, l.id)}
                  className={`w-full text-left rounded-xl p-3 font-mono text-xs transition-all flex items-center justify-between gap-2 ${
                    isActive
                      ? "border border-primary/40 bg-primary/15 text-primary font-bold shadow-sm shadow-primary/10"
                      : "text-muted-foreground hover:bg-card hover:text-foreground border border-transparent"
                  }`}
                >
                  <div className="min-w-0 flex-1 truncate">
                    <span className="opacity-70 mr-1.5">#{l.order}</span>
                    <span>{l.title}</span>
                  </div>
                  {l.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="text-[10px] opacity-70 shrink-0">+{l.xp} XP</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN LESSON VIEWER */}
      <div className="lg:col-span-8 space-y-6">
        {isLoading ? (
          <div className="glass-card rounded-3xl border border-border/70 p-12 text-center font-mono text-sm text-muted-foreground">
            <Terminal className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
            Ders modülü yükleniyor…
          </div>
        ) : !lesson ? (
          <div className="glass-card rounded-3xl border border-border/70 p-12 text-center font-mono">
            Ders bulunamadı. Lütfen sol menüden bir ders seçin.
          </div>
        ) : (
          <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-2xl space-y-8">
            {/* LESSON HEADER */}
            <div className="space-y-3 border-b border-border/60 pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs text-primary">
                    Modül #{lesson.order}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {lesson.level}
                  </Badge>
                  <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> {lesson.duration}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> +{lesson.xp} XP
                  </span>
                  {lesson.completed && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-[10px]">
                      Tamamlandı
                    </Badge>
                  )}
                </div>
              </div>

              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                {lesson.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {lesson.summary}
              </p>
            </div>

            {/* OUTCOMES & OBJECTIVES */}
            {lesson.outcomes && lesson.outcomes.length > 0 && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Bu Derste Neler Öğreneceksiniz?
                </div>
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  {lesson.outcomes.map((out, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-primary font-bold">•</span>
                      <span className="text-foreground leading-relaxed">{out}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CONTENT SECTIONS */}
            {lesson.sections && lesson.sections.length > 0 && (
              <div className="space-y-6">
                {lesson.sections.map((sec, idx) => (
                  <div key={idx} className="space-y-2">
                    <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      {sec.title}
                    </h4>
                    <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line pl-4 border-l-2 border-border/60">
                      {sec.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* COMMANDS PALETTE */}
            {lesson.commands && lesson.commands.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                  <Terminal className="h-4 w-4" /> Laboratuvar Terminal Komutları
                </div>
                <div className="space-y-2.5">
                  {lesson.commands.map((c, idx) => (
                    <div key={idx} className="rounded-2xl border border-border/60 bg-background/90 p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-foreground">
                          {c.cmd}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 font-mono text-xs text-primary"
                          onClick={() => copyCommand(c.cmd)}
                        >
                          {copiedCmd === c.cmd ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          <span className="ml-1 text-[11px]">{copiedCmd === c.cmd ? "Kopyalandı" : "Kopyala"}</span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{c.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EXERCISE / PRACTICAL LAB */}
            {lesson.exercise && (
              <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-5 space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-cyan">
                  <Play className="h-4 w-4" /> Pratik Laboratuvar Görevi
                </div>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">
                  {lesson.exercise}
                </p>
              </div>
            )}

            {/* SAFETY & LEGAL WARNING */}
            {lesson.safety && (
              <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-mono text-xs font-bold text-warn uppercase">Etik ve Yasal Sınırlar</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{lesson.safety}</p>
                </div>
              </div>
            )}

            {/* INTERACTIVE QUIZ SECTION */}
            {lesson.quizQuestions && lesson.quizQuestions.length > 0 && (
              <div className="rounded-3xl border border-border/80 bg-background/60 p-6 space-y-6 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                    <Brain className="h-4 w-4" /> Modül Sonu Değerlendirme Testi ({lesson.quizQuestions.length} Soru)
                  </div>
                  {lesson.quizPassed && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
                      Geçildi (Skor: %{lesson.bestScore})
                    </Badge>
                  )}
                </div>

                <div className="space-y-5">
                  {lesson.quizQuestions.map((q, qIdx) => (
                    <div key={q.id} className="space-y-3 rounded-2xl border border-border/50 bg-card/40 p-4">
                      <div className="font-semibold text-sm text-foreground">
                        <span className="font-mono text-primary mr-2">Soru {qIdx + 1}:</span>
                        {q.question}
                      </div>

                      <div className="grid gap-2">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = selectedAnswers[String(q.id)] === optIdx;
                          return (
                            <button
                              key={optIdx}
                              onClick={() => setSelectedAnswers({ ...selectedAnswers, [String(q.id)]: optIdx })}
                              className={`text-left rounded-xl border p-3 font-mono text-xs transition-colors flex items-center justify-between ${
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary font-bold"
                                  : "border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <span>{opt}</span>
                              {isSelected && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => quizMut.mutate()}
                  disabled={quizMut.isPending || Object.keys(selectedAnswers).length < lesson.quizQuestions.length}
                  className="font-mono w-full h-10 shadow-sm"
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {quizMut.isPending ? "Değerlendiriliyor…" : "Sınavı Tamamla ve Puanımı Hesapla"}
                </Button>
              </div>
            )}

            {/* CTF FLAG SUBMISSION */}
            {lesson.hasFlag && (
              <div className="rounded-3xl border border-cyan/40 bg-gradient-to-r from-cyan/10 via-card to-background p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-cyan">
                    <Flag className="h-4 w-4" /> CTF Bayrak Teslimi (+100 Bonus XP)
                  </div>
                  {lesson.flagCaptured && (
                    <Badge className="bg-cyan/20 text-cyan border border-cyan/40 font-mono text-xs">
                      Bayrak Yakalandı!
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Laboratuvardaki yönergeleri tamamlayıp gizli bayrağı bulduysanız aşağıya girerek anında 100 XP ödülü kazanın.
                  {lesson.flagHint && <span className="block mt-1 text-cyan font-mono">İpucu: {lesson.flagHint}</span>}
                </p>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="CYBERLAB{ornek_bayrak_kodu}..."
                    value={flagInput}
                    onChange={(e) => setFlagInput(e.target.value)}
                    className="font-mono text-xs h-10 rounded-xl"
                  />
                  <Button
                    onClick={() => flagMut.mutate()}
                    disabled={flagMut.isPending || !flagInput.trim()}
                    className="font-mono h-10 shrink-0 shadow-sm"
                  >
                    <Flag className="mr-1.5 h-3.5 w-3.5" />
                    {flagMut.isPending ? "Kontrol…" : "Bayrağı Gönder"}
                  </Button>
                </div>
              </div>
            )}

            {/* MARK LESSON AS COMPLETE BUTTON */}
            <div className="pt-6 border-t border-border/60 flex items-center justify-between gap-4">
              <span className="text-xs font-mono text-muted-foreground">
                Tüm adımları okuyup laboratuvarı tamamladıysanız dersi bitirin:
              </span>

              <Button
                size="lg"
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending || lesson.completed}
                className="font-mono shadow-lg shadow-primary/20"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {lesson.completed ? "Ders Tamamlandı ✓" : completeMut.isPending ? "Kaydediliyor…" : "Dersi Tamamla (+XP)"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 3. SİBER ARAÇ KÜTÜPHANESİ (125 ARAÇ)
// ==========================================

function ToolsView() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const fetchToolsFn = useServerFn(listAcademyTools);
  const { data: tools, isLoading } = useQuery({
    queryKey: ["cyberlab-academy-tools"],
    queryFn: () => fetchToolsFn(),
  });

  const categories = useMemo(() => {
    const list = [
      { key: "all", label: "Tümü (125)" },
      { key: "recon", label: "Keşif & Recon" },
      { key: "network", label: "Ağ & Trafik" },
      { key: "osint", label: "OSINT & İstihbarat" },
      { key: "web", label: "Web Zaafiyetleri" },
      { key: "crypto", label: "Kriptografi & Hash" },
      { key: "social", label: "Sosyal Mühendislik" },
      { key: "wireless", label: "Kablosuz Ağ" },
      { key: "bruteforce", label: "Parola & Brute Force" },
      { key: "file-tools", label: "Dosya & Forensics" },
    ];
    return list;
  }, []);

  const filtered = useMemo(() => {
    return (tools ?? []).filter((t: any) => {
      const matchQ = t.name.toLowerCase().includes(q.toLowerCase()) || t.tool.toLowerCase().includes(q.toLowerCase()) || t.desc.toLowerCase().includes(q.toLowerCase());
      const matchCat = category === "all" || t.cat === category;
      return matchQ && matchCat;
    });
  }, [tools, q, category]);

  const copyTool = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    toast.success("Komut şablonu kopyalandı!");
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="glass-card rounded-3xl border border-border/70 p-12 text-center font-mono text-sm text-muted-foreground">
        <Code className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
        Siber araç kütüphanesi taranıyor…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SEARCH & CATEGORY BAR */}
      <div className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl space-y-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Araç adı veya komut ara (örn: nmap, aircrack, sqlmap, whois)..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 font-mono text-sm h-10 rounded-xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
                category === cat.key
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-background/60 text-muted-foreground hover:text-foreground border border-border/60"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* TOOLS GRID */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t: any, idx: number) => (
          <div
            key={idx}
            className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors shadow-lg"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary uppercase">
                  {t.tag || t.cat}
                </span>
                <code className="font-mono text-xs text-muted-foreground">{t.tool}</code>
              </div>

              <h4 className="font-bold text-base text-foreground">{t.name}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {t.desc}
              </p>
            </div>

            <div className="pt-3 border-t border-border/40 space-y-2">
              <div className="rounded-xl border border-border/50 bg-background/80 p-2.5 flex items-center justify-between gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                  {t.cmd}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-primary"
                  onClick={() => copyTool(t.cmd)}
                  title="Komutu Kopyala"
                >
                  {copiedCmd === t.cmd ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>

              {t.param && (
                <div className="font-mono text-[10px] text-muted-foreground">
                  Parametre: <span className="text-foreground">{t.param}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. BAŞARI & ROZETLER (PROFİL)
// ==========================================

function ProfileView({ profile, user }: { profile: any; user: any }) {
  if (!user) {
    return (
      <div className="glass-card rounded-3xl border border-border/70 p-12 text-center font-mono">
        <Award className="h-10 w-10 text-primary mx-auto mb-3" />
        <h3 className="text-base font-bold">Kullanıcı Girişi Gerekli</h3>
        <p className="text-xs text-muted-foreground mt-1">İlerlemenizi ve başarı rozetlerinizi kaydetmek için lütfen giriş yapın.</p>
        <Button asChild size="sm" className="mt-4 font-mono">
          <Link to="/auth">Giriş Yap</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/20 text-2xl font-bold">
              {user.email?.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">{user.email?.split("@")[0]}</h3>
              <p className="text-xs font-mono text-primary mt-0.5">{profile?.rankTitle || "Çaylak Hacker"}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Kümülatif Skor</span>
            <div className="font-mono text-3xl font-black text-foreground">
              {profile?.totalXp ?? 0} <span className="text-sm text-primary font-normal">XP</span>
            </div>
          </div>
        </div>

        {/* METRICS */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Tamamlanan Dersler</span>
            <div className="font-mono text-2xl font-bold text-foreground mt-1">{profile?.completedLessons ?? 0} Adet</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Geçilen Sınavlar</span>
            <div className="font-mono text-2xl font-bold text-emerald-400 mt-1">{profile?.passedQuizzes ?? 0} Sınav</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Yakalanan Bayraklar (CTF)</span>
            <div className="font-mono text-2xl font-bold text-cyan mt-1">{profile?.capturedFlags ?? 0} Bayrak</div>
          </div>
        </div>

        {/* BADGES SHOWCASE */}
        <div className="space-y-4 pt-4 border-t border-border/60">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
            <Trophy className="h-4 w-4" /> Başarı Rozetleriniz
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(profile?.badges ?? []).map((b: any) => (
              <div
                key={b.id}
                className={`rounded-2xl border p-4 space-y-2 transition-all ${
                  b.earned
                    ? "border-primary/50 bg-primary/10 shadow-md shadow-primary/10"
                    : "border-border/40 bg-card/30 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">{b.name}</span>
                  {b.earned ? (
                    <Badge className="bg-primary text-primary-foreground font-mono text-[9px]">KAZANILDI</Badge>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">KİLİTLİ</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. VIP ERİŞİM PAKETLERİ
// ==========================================

function PackagesView({ products, access }: { products: any[]; access: any }) {
  return (
    <div className="space-y-6">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <Badge className="bg-primary/10 text-primary border border-primary/30 font-mono text-xs">
          SINIRSIZ SİBER GÜVENLİK ERİŞİMİ
        </Badge>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight">CyberLab VIP Paketleri</h2>
        <p className="text-sm text-muted-foreground">
          Tüm kurslara, 322 modüle, CTF bayrak laboratuvarına ve 125 güvenlik aracına sınırsız erişim sağlayın.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div
            key={p.id}
            className="glass-card rounded-3xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 p-6 backdrop-blur-xl flex flex-col justify-between space-y-6 shadow-xl hover:border-primary/60 transition-colors"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase text-primary">
                  {p.grants_app_days ? `${p.grants_app_days} Günlük Erişim` : "Ömür Boyu VIP"}
                </span>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>

              <h3 className="text-xl font-bold text-foreground">{p.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {p.description}
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="font-mono text-2xl font-black text-foreground">
                ₺{Number(p.price_try).toLocaleString("tr-TR")}
              </div>

              <Button asChild size="lg" className="font-mono w-full shadow-lg shadow-primary/20">
                <Link to="/urun/$slug" params={{ slug: p.slug }}>
                  Hemen Satın Al <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
