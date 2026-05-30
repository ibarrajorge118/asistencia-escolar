"use client";

import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  Fingerprint,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  attendance,
  gradeOrder,
  groupStats,
  groups,
  lastBiometricSync,
  localServer,
  readers,
  roles,
  students as seedStudents,
  teachers,
  type AttendanceRecord,
  type BiometricStatus,
  type Grade,
  type Group,
  type Reader,
  type ReaderStatus,
  type Role,
  type Student,
  type StudentStatus,
} from "@/lib/data";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "alumnos", label: "Alumnos", icon: Users },
  { id: "grupos", label: "Grupos", icon: BookOpen },
  { id: "monitoreo", label: "Asistencias", icon: Fingerprint },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
  { id: "lectores", label: "Lectores biometricos", icon: Radar },
  { id: "configuracion", label: "Configuracion", icon: ShieldCheck },
] as const;

type Section = (typeof navigation)[number]["id"];
type StudentFormData = Omit<Student, "id" | "huellaRegistrada" | "estadoBiometrico" | "biometricId" | "ultimoAcceso" | "ultimoLectorId">;

const roleAccess: Record<Role, Section[]> = {
  Director: ["dashboard", "alumnos", "grupos", "monitoreo", "reportes", "lectores", "configuracion"],
  Administrativo: ["dashboard", "alumnos", "grupos", "monitoreo", "reportes", "lectores", "configuracion"],
  Maestro: ["alumnos", "grupos", "monitoreo", "reportes"],
};

const roleLabels: Partial<Record<Role, Partial<Record<Section, string>>>> = {
  Administrativo: {},
  Maestro: { alumnos: "Mis alumnos", grupos: "Mis grupos", monitoreo: "Asistencias", reportes: "Reportes simples" },
};

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>("Director");
  const [selectedTeacherId, setSelectedTeacherId] = useState(teachers[0].id);
  const [active, setActive] = useState<Section>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentGradeFilter, setStudentGradeFilter] = useState("Todos");
  const [studentGroupFilter, setStudentGroupFilter] = useState("Todos");
  const [schoolStudents, setSchoolStudents] = useState<Student[]>(seedStudents);
  const [schoolGroups, setSchoolGroups] = useState<Group[]>(groups);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [changingGroupStudent, setChangingGroupStudent] = useState<Student | null>(null);
  const [scanningStudent, setScanningStudent] = useState<Student | null>(null);
  const [confirmStudent, setConfirmStudent] = useState<Student | null>(null);
  const [toast, setToast] = useState("");
  const teacherProfile = teachers.find((teacher) => teacher.id === selectedTeacherId) ?? teachers[0];
  const allowedSections = roleAccess[role];
  const currentActive = allowedSections.includes(active) ? active : allowedSections[0];
  const visibleNavigation = navigation
    .filter((item) => allowedSections.includes(item.id))
    .map((item) => ({ ...item, label: roleLabels[role]?.[item.id] ?? item.label }));
  const scopedGroups = role === "Maestro" ? schoolGroups.filter((group) => teacherProfile.gruposAsignados.includes(group.nombre)) : schoolGroups;
  const scopedStudents =
    role === "Maestro"
      ? schoolStudents.filter((student) => teacherProfile.gruposAsignados.includes(student.grupo))
      : schoolStudents;
  const scopedAttendance =
    role === "Maestro"
      ? attendance.filter((record) => teacherProfile.gruposAsignados.includes(record.grupo))
      : attendance;

  const stats = (() => {
    const groupRows = scopedGroups.map((group) => {
      const total = scopedStudents.filter((student) => student.grupo === group.nombre).length;
      const registros = scopedAttendance.filter((record) => record.grupo === group.nombre);
      const retardosGrupo = registros.filter((record) => record.estado === "Retardo").length;
      const faltasGrupo = Math.max(0, total - registros.length);
      const presentes = Math.max(0, total - faltasGrupo);
      const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;
      return { ...group, total, presentes, faltas: faltasGrupo, retardos: retardosGrupo, porcentaje };
    });
    const retardos = scopedAttendance.filter((record) => record.estado === "Retardo").length;
    const conectados = readers.filter((reader) => reader.estado === "Conectado").length;
    const faltas = Math.max(0, scopedStudents.length - scopedAttendance.length);
    return {
      totalAlumnos: scopedStudents.length,
      totalGrupos: scopedGroups.length,
      lectoresConectados: conectados,
      asistenciasDia: scopedAttendance.length,
      retardos,
      faltas,
      porcentajeGeneral: Math.round(((scopedStudents.length - faltas) / Math.max(scopedStudents.length, 1)) * 100),
      groupRows,
    };
  })();

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function importStudentsFromFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const errors: string[] = [];
      const nextId = Math.max(...schoolStudents.map((student) => student.id), 0) + 1;
      const imported: Student[] = [];
      const groupMap = new Map(schoolGroups.map((group) => [group.nombre, group]));

      rows.forEach((row, index) => {
        const line = index + 2;
        const nombre = readImportCell(row, "Nombre");
        const matricula = readImportCell(row, "Matricula") || readImportCell(row, "Matrícula");
        const grado = parseGrade(readImportCell(row, "Grado"));
        const groupLetter = readImportCell(row, "Grupo").toUpperCase();
        const tutor = readImportCell(row, "Tutor");
        const telefono = readImportCell(row, "Telefono") || readImportCell(row, "Teléfono");

        if (!nombre || !matricula || !grado || !groupLetter) {
          errors.push(`Fila ${line}: faltan Nombre, Matricula, Grado o Grupo`);
          return;
        }

        const grupo = `${gradeNumber(grado)}${groupLetter.replace(/[^A-Z0-9]/g, "")}`;
        if (!groupMap.has(grupo)) {
          const created: Group = {
            id: groupMap.size + 1,
            nombre: grupo,
            grado,
            tutor: teachers[0].nombre,
            aula: `${gradeNumber(grado)}-${groupLetter || "A"}`,
          };
          groupMap.set(grupo, created);
        }

        const id = nextId + imported.length;
        imported.push({
          id,
          nombre,
          matricula,
          grado,
          grupo,
          estado: "Activo",
          tutor,
          telefono,
          observaciones: "",
          huellaRegistrada: false,
          estadoBiometrico: "Pendiente",
          biometricId: `BIO-STU-${String(id).padStart(5, "0")}`,
          ultimoAcceso: "Pendiente",
          ultimoLectorId: "",
        });
      });

      if (imported.length > 0) {
        setSchoolGroups(Array.from(groupMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX", { numeric: true })));
        setSchoolStudents((items) => [...imported, ...items]);
      }

      setImportErrors(errors);
      notify(errors.length > 0 ? `${imported.length} alumnos importados. Revisa filas con error.` : `${imported.length} alumnos importados correctamente`);
    } catch {
      notify("No se pudo leer el archivo. Revisa el formato de Excel.");
    }
  }

  function registerFingerprint(student: Student) {
    setScanningStudent(student);
    window.setTimeout(() => {
      setSchoolStudents((items) =>
        items.map((item) =>
          item.id === student.id
            ? { ...item, huellaRegistrada: true, estadoBiometrico: "Huella registrada", ultimoAcceso: "07:35" }
            : item,
        ),
      );
      setScanningStudent(null);
      notify("Huella registrada o reemplazada correctamente");
    }, 1100);
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        role={role}
        setRole={setRole}
        selectedTeacherId={selectedTeacherId}
        setSelectedTeacherId={setSelectedTeacherId}
        onLogin={() => setIsLoggedIn(true)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <Toast message={toast} />
      {scanningStudent && <BiometricCaptureOverlay student={scanningStudent} />}
      {showStudentModal && (
        <NewStudentModal
          groupsScope={schoolGroups}
          onClose={() => setShowStudentModal(false)}
          onSave={(studentData) => {
            const nextId = Math.max(...schoolStudents.map((student) => student.id)) + 1;
            setSchoolStudents((items) => [
              {
                ...studentData,
                id: nextId,
                huellaRegistrada: true,
                estadoBiometrico: "Huella registrada",
                biometricId: `BIO-STU-${String(nextId).padStart(5, "0")}`,
                ultimoAcceso: "Enrolado 07:36",
                ultimoLectorId: "BIO-ENT-01",
              },
              ...items,
            ]);
            setShowStudentModal(false);
            notify("Alumno registrado y listo para asistencia biometrica");
          }}
        />
      )}
      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          groupsScope={schoolGroups}
          onClose={() => setEditingStudent(null)}
          onSave={(student) => {
            setSchoolStudents((items) => items.map((item) => (item.id === student.id ? student : item)));
            setEditingStudent(null);
            notify("Informacion del alumno actualizada");
          }}
          onFingerprint={(student) => {
            setEditingStudent(null);
            registerFingerprint(student);
          }}
        />
      )}
      {changingGroupStudent && (
        <ChangeGroupModal
          student={changingGroupStudent}
          groupsScope={schoolGroups}
          onClose={() => setChangingGroupStudent(null)}
          onSave={(student) => {
            setSchoolStudents((items) => items.map((item) => (item.id === student.id ? student : item)));
            setChangingGroupStudent(null);
            notify("Grupo del alumno actualizado");
          }}
        />
      )}
      {confirmStudent && (
        <ConfirmDialog
          message="¿Seguro que deseas eliminar este alumno?"
          onCancel={() => setConfirmStudent(null)}
          onConfirm={() => {
            setSchoolStudents((items) => items.filter((item) => item.id !== confirmStudent.id));
            setConfirmStudent(null);
            notify("Alumno eliminado del padron activo");
          }}
        />
      )}

      <section className="grid min-h-screen lg:grid-cols-[286px_1fr]">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[286px] border-r border-blue-100 bg-white transition-transform duration-300 lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-20 items-center justify-between border-b border-blue-100 px-5">
              <Brand compact />
              <button
                className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label="Cerrar menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-6">
              {visibleNavigation.map((item) => {
                const Icon = item.icon;
                const selected = currentActive === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActive(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-all duration-200 ${
                      selected
                        ? "bg-blue-600 text-white shadow-soft"
                        : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                    }`}
                  >
                    <Icon size={19} />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-blue-100 p-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Sesion</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{role}</p>
                {role === "Maestro" && <p className="mt-1 text-xs text-slate-500">Grupos: {teacherProfile.gruposAsignados.join(", ")}</p>}
                <p className="mt-1 text-xs text-slate-500">Sincronizacion: {lastBiometricSync}</p>
              </div>
              <button
                onClick={() => setIsLoggedIn(false)}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-100 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <LogOut size={17} />
                Salir
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar fondo"
          />
        )}

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 backdrop-blur">
            <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  className="grid h-10 w-10 place-items-center rounded-lg border border-blue-100 text-slate-700 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Abrir menu"
                >
                  <Menu size={20} />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-700">Sistema Biometrico</p>
                  <h1 className="truncate text-xl font-bold sm:text-2xl">{sectionTitle(currentActive, role)}</h1>
                </div>
              </div>
              <div className="hidden items-center gap-3 md:flex">
                <StatusPill label={role === "Maestro" ? `${stats.totalGrupos} grupos asignados` : `${stats.lectoresConectados} de ${readers.length} lectores`} tone="green" />
                <StatusPill label={role === "Maestro" ? teacherProfile.nombre : "Acceso total"} tone="blue" />
              </div>
            </div>
          </header>

          <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            {currentActive === "dashboard" && <Dashboard stats={stats} role={role} teacherName={teacherProfile.nombre} />}
            {currentActive === "alumnos" && (
              <StudentsSection
                query={studentQuery}
                setQuery={setStudentQuery}
                gradeFilter={studentGradeFilter}
                setGradeFilter={setStudentGradeFilter}
                groupFilter={studentGroupFilter}
                setGroupFilter={setStudentGroupFilter}
                students={scopedStudents}
                groupsScope={scopedGroups}
                importErrors={importErrors}
                role={role}
                onNew={() => setShowStudentModal(true)}
                onImportFile={importStudentsFromFile}
                onEdit={setEditingStudent}
                onChangeGroup={setChangingGroupStudent}
                onDisable={setConfirmStudent}
                onFingerprint={registerFingerprint}
              />
            )}
            {currentActive === "grupos" && <GroupsSection role={role} groupsScope={scopedGroups} students={scopedStudents} onView={() => notify(role === "Maestro" ? "Mostrando solo grupos asignados" : "Vista de alumnos filtrada por grupo")} onToast={notify} />}
            {currentActive === "monitoreo" && <BiometricMonitor onToast={notify} attendanceScope={scopedAttendance} role={role} />}
            {currentActive === "reportes" && <ReportsSection stats={stats} onDownload={() => {
              downloadPdfDemo();
              notify("Reporte PDF descargado");
            }} role={role} />}
            {currentActive === "lectores" && <ReadersSection onToast={notify} />}
            {currentActive === "configuracion" && <BasicConfigSection />}
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginScreen({
  role,
  setRole,
  selectedTeacherId,
  setSelectedTeacherId,
  onLogin,
}: {
  role: Role;
  setRole: (role: Role) => void;
  selectedTeacherId: number;
  setSelectedTeacherId: (id: number) => void;
  onLogin: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_34%),linear-gradient(135deg,#f8fafc,#eff6ff)] px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-blue-100 bg-white shadow-soft lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-h-[540px] flex-col justify-between bg-blue-700 p-8 text-white lg:p-10">
          <Brand light />
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">
              <Fingerprint size={18} />
              Control automatico por huella
            </div>
            <h1 className="max-w-xl text-4xl font-bold leading-tight lg:text-5xl">
              Sistema Biometrico de Asistencia Escolar
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-blue-50">
              Plataforma profesional para registrar entradas, retardos y faltas mediante lectores biometricos conectados en tiempo real.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-blue-50 sm:grid-cols-3">
            <LoginSignal label="720 alumnos" />
            <LoginSignal label="18 grupos" />
            <LoginSignal label="6 lectores" />
          </div>
        </div>

        <div className="flex items-center p-6 sm:p-10">
          <div className="w-full">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Ingreso seguro</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Selecciona tu rol</h2>
            <p className="mt-2 text-sm text-slate-500">
              Demo institucional con acceso para direccion, administracion y maestros.
            </p>

            <label className="mt-8 block text-sm font-semibold text-slate-700">
              Rol de usuario
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="mt-2 h-12 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {roles.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {role === "Maestro" && (
              <label className="mt-4 block text-sm font-semibold text-slate-700">
                Maestro
                <select
                  value={selectedTeacherId}
                  onChange={(event) => setSelectedTeacherId(Number(event.target.value))}
                  className="mt-2 h-12 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.nombre} - {teacher.gruposAsignados.join(", ")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              onClick={onLogin}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              <ShieldCheck size={19} />
              Ingresar
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ stats, role, teacherName }: { stats: ReturnType<typeof buildStatsShape>; role: Role; teacherName: string }) {
  const title = role !== "Maestro" ? "Resumen de hoy" : `Mis grupos - ${teacherName}`;
  return (
    <section className="space-y-5">
      <Panel title={title} action={<StatusPill label={role === "Maestro" ? "Consulta" : "Operativo"} tone="blue" />}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Total alumnos" value={stats.totalAlumnos} detail={role === "Maestro" ? "Asignados" : "Padron escolar"} icon={Users} tone="blue" />
          <Metric title="Asistencias del dia" value={stats.asistenciasDia} detail="Entradas registradas" icon={UserCheck} tone="green" />
          <Metric title="Retardos" value={stats.retardos} detail="Despues de tolerancia" icon={Clock3} tone="amber" />
          <Metric title="Lectores conectados" value={`${stats.lectoresConectados}/${readers.length}`} detail="Estado actual" icon={Fingerprint} tone="indigo" />
        </div>
      </Panel>

      <Panel title="Actividad reciente" action={<StatusPill label={lastBiometricSync} tone="green" />}>
        <DataTable
          columns={["Alumno", "Grupo", "Hora", "Estado"]}
          rows={attendance.slice(0, 6).map((record) => [record.alumno, record.grupo, record.hora, record.estado])}
          badgeColumns={[3]}
        />
      </Panel>
    </section>
  );
}

function StudentsSection({
  query,
  setQuery,
  gradeFilter,
  setGradeFilter,
  groupFilter,
  setGroupFilter,
  students,
  groupsScope,
  importErrors,
  role,
  onNew,
  onImportFile,
  onEdit,
  onChangeGroup,
  onDisable,
  onFingerprint,
}: {
  query: string;
  setQuery: (value: string) => void;
  gradeFilter: string;
  setGradeFilter: (value: string) => void;
  groupFilter: string;
  setGroupFilter: (value: string) => void;
  students: Student[];
  groupsScope: Group[];
  importErrors: string[];
  role: Role;
  onNew: () => void;
  onImportFile: (file: File) => void;
  onEdit: (student: Student) => void;
  onChangeGroup: (student: Student) => void;
  onDisable: (student: Student) => void;
  onFingerprint: (student: Student) => void;
}) {
  const availableGroups = useMemo(() => {
    const source = gradeFilter === "Todos" ? groupsScope : groupsScope.filter((group) => group.grado === gradeFilter);
    return source.map((group) => group.nombre);
  }, [gradeFilter, groupsScope]);

  const filteredStudents = useMemo(() => {
    const value = query.trim().toLowerCase();
    return students.filter((student) => {
      const matchesGrade = gradeFilter === "Todos" || student.grado === gradeFilter;
      const matchesGroup = groupFilter === "Todos" || student.grupo === groupFilter;
      const matchesQuery =
        !value ||
        [student.nombre, student.matricula, student.grado, student.grupo, student.tutor ?? "", student.telefono ?? "", student.estado].some((field) =>
        field.toLowerCase().includes(value),
      );
      return matchesGrade && matchesGroup && matchesQuery;
    });
  }, [gradeFilter, groupFilter, query, students]);

  return (
    <section className="space-y-5">
      <Panel
        title={role === "Maestro" ? "Mis alumnos asignados" : "Gestion de alumnos"}
        action={
          role === "Maestro" ? (
            <StatusPill label="Solo consulta" tone="blue" />
          ) : (
            <div className="flex flex-wrap gap-2">
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-blue-100 px-4 text-sm font-bold text-blue-700 transition hover:bg-blue-50">
                <Upload size={17} />
                Importar Excel
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImportFile(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button onClick={onNew} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
                <Plus size={17} />
                Nuevo alumno
              </button>
            </div>
          )
        }
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar alumno"
              className="h-11 w-full rounded-lg border border-blue-100 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
          </div>
          <SelectField label="Grado" options={["Todos", ...gradeOrder]} value={gradeFilter} onChange={(value) => {
            setGradeFilter(value);
            setGroupFilter("Todos");
          }} />
          <SelectField label="Grupo" options={["Todos", ...availableGroups]} value={groupFilter} onChange={setGroupFilter} />
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-500">{filteredStudents.length} alumnos encontrados</p>
      </Panel>

      {importErrors.length > 0 && role !== "Maestro" && (
        <Panel title="Filas con error" action={<StatusPill label={`${importErrors.length} errores`} tone="blue" />}>
          <div className="space-y-2 text-sm text-rose-700">
            {importErrors.slice(0, 8).map((error) => (
              <p key={error} className="rounded-lg bg-rose-50 px-3 py-2 font-semibold">{error}</p>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Listado por grupo" action={<StatusPill label={`${filteredStudents.length} alumnos`} tone="blue" />}>
        <StudentActionsTable
          rows={filteredStudents}
          readOnly={role === "Maestro"}
          onEdit={onEdit}
          onChangeGroup={onChangeGroup}
          onDisable={onDisable}
          onFingerprint={onFingerprint}
        />
      </Panel>
    </section>
  );
}

function StudentActionsTable({
  rows,
  readOnly,
  onEdit,
  onChangeGroup,
  onDisable,
  onFingerprint,
}: {
  rows: Student[];
  readOnly: boolean;
  onEdit: (student: Student) => void;
  onChangeGroup: (student: Student) => void;
  onDisable: (student: Student) => void;
  onFingerprint: (student: Student) => void;
}) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-blue-100 bg-blue-50/80 text-xs uppercase tracking-wide text-blue-700">
            {["Nombre", "Matricula", "Grado", "Grupo", "Tutor", "Telefono", "Estatus", readOnly ? "Permiso" : "Acciones"].map((column) => (
              <th key={column} className="px-4 py-3 font-bold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((student) => (
            <tr key={student.id} className="border-b border-slate-100 transition hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-800">{student.nombre}</td>
              <td className="px-4 py-3 text-slate-700">{student.matricula}</td>
              <td className="px-4 py-3 text-slate-700">{student.grado}</td>
              <td className="px-4 py-3 text-slate-700">{student.grupo}</td>
              <td className="px-4 py-3 text-slate-700">{student.tutor || "Sin tutor"}</td>
              <td className="px-4 py-3 text-slate-700">{student.telefono || "Sin telefono"}</td>
              <td className="px-4 py-3"><StatusBadge value={student.estado} /></td>
              <td className="px-4 py-3">
                {readOnly ? (
                  <StatusBadge value="Consulta" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <IconButton label="Editar" icon={Edit3} onClick={() => onEdit(student)} />
                    <IconButton label="Grupo" icon={RefreshCcw} onClick={() => onChangeGroup(student)} />
                    <IconButton label="Huella" icon={Fingerprint} onClick={() => onFingerprint(student)} />
                    <IconButton label="Eliminar" icon={UserX} onClick={() => onDisable(student)} />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupBiometricSection({
  students,
  setStudents,
  onToast,
}: {
  students: Student[];
  setStudents: Dispatch<SetStateAction<Student[]>>;
  onToast: (message: string) => void;
}) {
  const [selectedGrade, setSelectedGrade] = useState<Grade>("Primer grado");
  const [selectedGroup, setSelectedGroup] = useState("1A");
  const [scanning, setScanning] = useState<Student | null>(null);
  const groupOptions = groups.filter((group) => group.grado === selectedGrade);
  const rows = students.filter((student) => student.grado === selectedGrade && student.grupo === selectedGroup);
  const registered = rows.filter((student) => student.estadoBiometrico === "Huella registrada").length;
  const pending = rows.find((student) => student.estadoBiometrico !== "Huella registrada");

  function capture(student: Student) {
    setScanning(student);
    window.setTimeout(() => {
      setStudents((items) =>
        items.map((item) =>
          item.id === student.id
            ? { ...item, huellaRegistrada: true, estadoBiometrico: "Huella registrada", ultimoAcceso: "Enrolado 07:36" }
            : item,
        ),
      );
      setScanning(null);
      onToast("Captura realizada correctamente");
    }, 1200);
  }

  return (
    <section className="space-y-6">
      {scanning && (
        <BiometricCaptureOverlay student={scanning} />
      )}
      <Panel title="Registro biometrico por grupos" action={<StatusPill label={`${registered} de ${rows.length} alumnos registrados`} tone="blue" />}>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.2fr]">
          <SelectField label="Grado" options={gradeOrder} value={selectedGrade} onChange={(value) => {
            const grade = value as Grade;
            setSelectedGrade(grade);
            setSelectedGroup(groups.find((group) => group.grado === grade)?.nombre ?? "1A");
          }} />
          <SelectField label="Grupo" options={groupOptions.map((group) => group.nombre)} value={selectedGroup} onChange={setSelectedGroup} />
          <div>
            <p className="text-sm font-semibold text-slate-600">Progreso</p>
            <div className="mt-3">
              <ProgressRow label={`${registered} de ${rows.length} alumnos registrados`} value={Math.round((registered / Math.max(rows.length, 1)) * 100)} meta={`${Math.round((registered / Math.max(rows.length, 1)) * 100)}%`} />
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title={`Lista de captura - Grupo ${selectedGroup}`}
        action={
          <button
            onClick={() => pending && capture(pending)}
            disabled={!pending}
            className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Fingerprint size={17} />
            Registrar siguiente pendiente
          </button>
        }
      >
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-blue-100 bg-blue-50/80 text-xs uppercase tracking-wide text-blue-700">
                {["Nombre", "Matricula", "Estado biometrico", "Accion"].map((column) => (
                  <th key={column} className="px-4 py-3 font-bold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => (
                <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{student.nombre}</td>
                  <td className="px-4 py-3 text-slate-700">{student.matricula}</td>
                  <td className="px-4 py-3"><BiometricStatusBadge value={student.estadoBiometrico} /></td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => capture(student)}
                      className="h-9 rounded-lg border border-blue-100 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                    >
                      Registrar huella
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function ImportStudentsSection({ onToast }: { onToast: (message: string) => void }) {
  const [fileName, setFileName] = useState("");
  const [loaded, setLoaded] = useState(false);

  function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setLoaded(true);
    onToast("Archivo Excel analizado correctamente");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Importar alumnos desde Excel" action={<StatusPill label="Plantilla institucional" tone="blue" />}>
        <label className="grid min-h-72 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 text-center transition hover:bg-blue-50">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-white text-blue-700 shadow-soft">
              <Upload size={30} />
            </div>
            <p className="mt-4 text-lg font-bold">Subir archivo Excel</p>
            <p className="mt-2 text-sm text-slate-500">Columnas esperadas: Nombre, Matricula, Grado, Grupo</p>
            {fileName && <p className="mt-3 text-sm font-bold text-blue-700">{fileName}</p>}
          </div>
        </label>
      </Panel>

      <Panel title="Resultado de validacion" action={<StatusPill label={loaded ? "Listo para importar" : "Esperando archivo"} tone={loaded ? "green" : "blue"} />}>
        <div className="grid gap-4 sm:grid-cols-3">
          <MiniMetric label="Alumnos importados" value={loaded ? 128 : 0} tone="green" />
          <MiniMetric label="Errores encontrados" value={loaded ? 3 : 0} tone="red" />
          <MiniMetric label="Duplicados detectados" value={loaded ? 5 : 0} tone="amber" />
        </div>
        <div className="mt-5 rounded-lg border border-blue-100 bg-slate-50 p-4">
          <p className="font-bold text-slate-900">Generacion automatica preparada</p>
          <p className="mt-1 text-sm text-slate-500">
            Si el archivo contiene grados o grupos nuevos, el sistema los crea en la configuracion local antes de enrolar huellas.
          </p>
        </div>
      </Panel>
    </section>
  );
}

function ServerStatusSection() {
  const items = [
    { label: "Servidor activo", value: "En linea", ok: localServer.servidorActivo },
    { label: "Base de datos conectada", value: "Base local lista", ok: localServer.baseDatosConectada },
    { label: "Lectores sincronizados", value: `${localServer.lectoresSincronizados} de ${readers.length}`, ok: localServer.lectoresSincronizados >= 4 },
    { label: "Modo servidor local", value: `${localServer.ipServidor}:${localServer.puerto}`, ok: true },
  ];

  return (
    <section className="space-y-6">
      <Panel title="Estado del servidor" action={<StatusPill label={localServer.modo} tone="green" />}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <article key={item.label} className="rounded-lg border border-blue-100 bg-white p-4">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${item.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
                <p className="text-sm font-semibold text-slate-500">{item.label}</p>
              </div>
              <p className="mt-3 text-lg font-bold text-slate-950">{item.value}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Configuracion local preparada" action={<StatusPill label={`Ultima sincronizacion: ${localServer.ultimaSincronizacion}`} tone="blue" />}>
        <div className="grid gap-4 lg:grid-cols-3">
          <InfoCard title="Inicio automatico" text="Preparado para ejecutarse al encender la computadora central escolar." />
          <InfoCard title="Base local" text="Estructura lista para conectar SQLite, PostgreSQL local o servicio escolar interno." />
          <InfoCard title="Multiples lectores" text="Cada evento conserva ID biometrico, ID de lector, IP, hora y resultado de sincronizacion." />
        </div>
      </Panel>
    </section>
  );
}

function GroupsSection({
  role,
  groupsScope,
  students,
  onView,
  onToast,
}: {
  role: Role;
  groupsScope: typeof groups;
  students: Student[];
  onView: () => void;
  onToast: (message: string) => void;
}) {
  const [editingGroup, setEditingGroup] = useState<(typeof groups)[number] | null>(null);
  const [teacherOverrides, setTeacherOverrides] = useState<Record<string, string>>({});
  const rows = groupsScope.map((group) => ({
    ...group,
    tutor: teacherOverrides[group.nombre] ?? group.tutor,
    total: students.filter((student) => student.grupo === group.nombre).length,
  }));
  return (
    <section className="space-y-5">
      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          teacher={teacherOverrides[editingGroup.nombre] ?? editingGroup.tutor}
          onClose={() => setEditingGroup(null)}
          onSave={(teacher) => {
            setTeacherOverrides((items) => ({ ...items, [editingGroup.nombre]: teacher }));
            setEditingGroup(null);
            onToast("Maestro del grupo actualizado");
          }}
        />
      )}
      {role === "Maestro" && (
        <Panel title="Mis grupos asignados" action={<StatusPill label="Acceso limitado" tone="blue" />}>
          <p className="text-sm text-slate-500">Consulta simple de grupos, alumnos y asistencias.</p>
        </Panel>
      )}
      <Panel title={role === "Maestro" ? "Mis grupos" : "Grupos"} action={<StatusPill label={`${rows.length} grupos`} tone="blue" />}>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-blue-100 bg-blue-50/80 text-xs uppercase tracking-wide text-blue-700">
                {["Grupo", "Maestro asignado", "Alumnos", role === "Maestro" ? "Permiso" : "Acciones"].map((column) => (
                  <th key={column} className="px-4 py-3 font-bold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((group) => (
                <tr key={group.nombre} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{group.nombre}</td>
                  <td className="px-4 py-3 text-slate-700">{group.tutor}</td>
                  <td className="px-4 py-3 text-slate-700">{group.total}</td>
                  <td className="px-4 py-3">
                    {role === "Maestro" ? (
                      <StatusBadge value="Consulta" />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <IconButton label="Editar" icon={Edit3} onClick={() => setEditingGroup(group)} />
                        <IconButton label="Ver alumnos" icon={Users} onClick={onView} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function BiometricMonitor({
  onToast,
  attendanceScope,
  role,
}: {
  onToast: (message: string) => void;
  attendanceScope: AttendanceRecord[];
  role: Role;
}) {
  const recent = attendanceScope.slice(0, 10);

  return (
    <section className="space-y-5">
      <Panel title={role === "Maestro" ? "Asistencias de mis grupos" : "Asistencias"} action={<StatusPill label="Entrada, retardo y falta" tone="blue" />}>
        <DataTable
          columns={["Alumno", "Matricula", "Grupo", "Hora", "Lector", "Estado"]}
          rows={recent.map((record) => [record.alumno, record.matricula, record.grupo, record.hora, record.lector, record.estado])}
          badgeColumns={[5]}
        />
      </Panel>
      {role !== "Maestro" && <AuthorizedExitForm onToast={onToast} />}
    </section>
  );
}

function ReportsSection({
  stats,
  onDownload,
  role,
}: {
  stats: ReturnType<typeof buildStatsShape>;
  onDownload: () => void;
  role: Role;
}) {
  return (
    <section className="space-y-6">
      <Panel
        title={role === "Maestro" ? "Reportes simples de mis grupos" : "Resumen general institucional"}
        action={
          <button onClick={onDownload} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
            <Download size={17} />
            {role === "Maestro" ? "Descargar reporte simple" : "Descargar PDF"}
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Entradas" value={stats.asistenciasDia} tone="green" />
          <MiniMetric label="Faltas" value={stats.faltas} tone="red" />
          <MiniMetric label="Retardos" value={stats.retardos} tone="amber" />
          <MiniMetric label="Asistencia" value={`${stats.porcentajeGeneral}%`} tone={reportTone(stats.porcentajeGeneral)} />
        </div>
      </Panel>

      <Panel title="Reporte por grupo" action={<StatusPill label={`${stats.groupRows.length} grupos`} tone="blue" />}>
        <DataTable
          columns={["Grupo", "Entradas", "Retardos", "Faltas"]}
          rows={stats.groupRows.map((group) => [group.nombre, String(group.presentes), String(group.retardos), String(group.faltas)])}
        />
      </Panel>
    </section>
  );
}

function AuthorizedExitForm({ onToast }: { onToast: (message: string) => void }) {
  const [student, setStudent] = useState(attendance[0]?.alumno ?? "");
  const [time, setTime] = useState("12:30");
  const [reason, setReason] = useState("Cita medica");
  const [authorizedBy, setAuthorizedBy] = useState("Direccion escolar");

  function submit() {
    onToast(`Salida autorizada registrada para ${student}`);
  }

  return (
    <Panel title="Salida autorizada" action={<StatusPill label="Registro manual controlado" tone="blue" />}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ControlledField label="Alumno" value={student} onChange={setStudent} />
        <ControlledField label="Hora" value={time} onChange={setTime} />
        <ControlledField label="Motivo" value={reason} onChange={setReason} />
        <ControlledField label="Autorizado por" value={authorizedBy} onChange={setAuthorizedBy} />
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-blue-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Este registro no crea salida automatica ni doble asistencia; solo documenta una salida autorizada.
        </p>
        <button onClick={submit} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
          Guardar salida
        </button>
      </div>
    </Panel>
  );
}

function BasicConfigSection() {
  return (
    <section className="space-y-5">
      <Panel title="Configuracion basica" action={<StatusPill label="Escuela secundaria" tone="blue" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title="Nombre de escuela" text={localServer.nombreInstitucional} />
          <InfoCard title="Horario de entrada" text="07:00 a 07:10 normal. Despues se registra retardo." />
          <InfoCard title="Grupos" text={`${groups.length} grupos configurados con un maestro asignado por grupo.`} />
          <InfoCard title="Lectores" text="Preparado para lectores de entrada conectados al servidor local." />
        </div>
      </Panel>
    </section>
  );
}

function ReadersSection({ onToast }: { onToast: (message: string) => void }) {
  const [readerRows, setReaderRows] = useState(readers);
  const [editingReader, setEditingReader] = useState<Reader | null>(null);
  const connected = readerRows.filter((reader) => reader.estado === "Conectado").length;

  function addReader() {
    const nextId = Math.max(...readerRows.map((reader) => reader.id), 0) + 1;
    setReaderRows((items) => [
      ...items,
      {
        id: nextId,
        readerId: `BIO-ENT-${String(nextId).padStart(2, "0")}`,
        nombre: `Lector ${nextId}`,
        ubicacion: "Entrada principal",
        ip: "",
        estado: "Desconectado",
        ultimaSincronizacion: "Pendiente",
        ultimaLectura: "Sin lecturas",
        firmware: "",
      },
    ]);
    onToast("Lector agregado");
  }

  return (
    <section className="space-y-6">
      {editingReader && (
        <EditReaderModal
          reader={editingReader}
          onClose={() => setEditingReader(null)}
          onSave={(reader) => {
            setReaderRows((items) => items.map((item) => (item.id === reader.id ? reader : item)));
            setEditingReader(null);
            onToast("Lector actualizado");
          }}
        />
      )}
      <Panel
        title="Lectores biometricos"
        action={
          <button onClick={addReader} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">
            <Plus size={17} />
            Agregar lector
          </button>
        }
      >
        <p className="mb-4 text-sm font-semibold text-slate-500">{connected} de {readerRows.length} conectados</p>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-blue-100 bg-blue-50/80 text-xs uppercase tracking-wide text-blue-700">
                {["Nombre", "Ubicacion", "Estado", "Acciones"].map((column) => (
                  <th key={column} className="px-4 py-3 font-bold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {readerRows.map((reader) => (
                <tr key={reader.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{reader.nombre}</td>
                  <td className="px-4 py-3 text-slate-700">{reader.ubicacion}</td>
                  <td className="px-4 py-3"><StatusDot status={reader.estado === "Sincronizando" ? "Conectado" : reader.estado} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <IconButton label="Editar" icon={Edit3} onClick={() => setEditingReader(reader)} />
                      <IconButton label="Eliminar" icon={UserX} onClick={() => {
                        setReaderRows((items) => items.filter((item) => item.id !== reader.id));
                        onToast("Lector eliminado");
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function EditReaderModal({
  reader,
  onClose,
  onSave,
}: {
  reader: Reader;
  onClose: () => void;
  onSave: (reader: Reader) => void;
}) {
  const [name, setName] = useState(reader.nombre);
  const [location, setLocation] = useState(reader.ubicacion);
  const [status, setStatus] = useState<ReaderStatus>(reader.estado === "Sincronizando" ? "Conectado" : reader.estado);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Editar lector</p>
            <h2 className="text-xl font-bold">{reader.nombre}</h2>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <ControlledField label="Nombre del lector" value={name} onChange={setName} />
          <ControlledField label="Ubicacion" value={location} onChange={setLocation} />
          <SelectField label="Estado" options={["Conectado", "Desconectado"]} value={status} onChange={(value) => setStatus(value as ReaderStatus)} />
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 rounded-lg border border-blue-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={() => onSave({ ...reader, nombre: name, ubicacion: location, estado: status })} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            Guardar lector
          </button>
        </div>
      </section>
    </div>
  );
}

function NewStudentModal({
  groupsScope,
  onClose,
  onSave,
}: {
  groupsScope: Group[];
  onClose: () => void;
  onSave: (student: StudentFormData) => void;
}) {
  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("SEC-3321");
  const [grade, setGrade] = useState<Grade>("Primer grado");
  const [group, setGroup] = useState("1A");
  const [tutor, setTutor] = useState("");
  const [telefono, setTelefono] = useState("");
  const groupOptions = groupsScope.filter((item) => item.grado === grade).map((item) => item.nombre);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-xl rounded-lg bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Nuevo alumno</p>
            <h2 className="text-xl font-bold">Registro con huella simulada</h2>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ControlledField label="Nombre" value={name} onChange={setName} placeholder="Nombre completo" />
          <ControlledField label="Matricula" value={matricula} onChange={setMatricula} />
          <SelectField label="Grado" options={gradeOrder} value={grade} onChange={(value) => {
            const nextGrade = value as Grade;
            setGrade(nextGrade);
            setGroup(groupsScope.find((item) => item.grado === nextGrade)?.nombre ?? group);
          }} />
          <SelectField label="Grupo" options={groupOptions} value={group} onChange={setGroup} />
          <ControlledField label="Tutor" value={tutor} onChange={setTutor} placeholder="Nombre del tutor" />
          <ControlledField label="Telefono" value={telefono} onChange={setTelefono} placeholder="8112345678" />
        </div>
        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="text-blue-700" size={28} />
            <div>
              <p className="font-bold">Registrar huella</p>
              <p className="text-sm text-slate-500">Simulacion de enrolamiento biometrico lista.</p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 rounded-lg border border-blue-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ nombre: name || "Alumno nuevo", matricula, grado: grade, grupo: group, estado: "Activo", tutor, telefono, observaciones: "" })}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
          >
            Guardar alumno
          </button>
        </div>
      </section>
    </div>
  );
}

function EditStudentModal({
  student,
  groupsScope,
  onClose,
  onSave,
  onFingerprint,
}: {
  student: Student;
  groupsScope: Group[];
  onClose: () => void;
  onSave: (student: Student) => void;
  onFingerprint: (student: Student) => void;
}) {
  const [name, setName] = useState(student.nombre);
  const [matricula, setMatricula] = useState(student.matricula);
  const [grade, setGrade] = useState<Grade>(student.grado);
  const [group, setGroup] = useState(student.grupo);
  const [tutor, setTutor] = useState(student.tutor ?? "");
  const [telefono, setTelefono] = useState(student.telefono ?? "");
  const [status, setStatus] = useState<StudentStatus>(student.estado);
  const [observations, setObservations] = useState(student.observaciones ?? "");
  const groupOptions = groupsScope.filter((item) => item.grado === grade).map((item) => item.nombre);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Editar alumno</p>
            <h2 className="text-xl font-bold">Informacion y registro biometrico</h2>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ControlledField label="Nombre completo" value={name} onChange={setName} />
          <ControlledField label="Matricula" value={matricula} onChange={setMatricula} />
          <SelectField label="Grado" options={gradeOrder} value={grade} onChange={(value) => {
            const nextGrade = value as Grade;
            setGrade(nextGrade);
            setGroup(groupsScope.find((item) => item.grado === nextGrade)?.nombre ?? group);
          }} />
          <SelectField label="Grupo" options={groupOptions} value={group} onChange={setGroup} />
          <ControlledField label="Tutor" value={tutor} onChange={setTutor} />
          <ControlledField label="Telefono" value={telefono} onChange={setTelefono} />
          <SelectField label="Estado" options={["Activo", "Inactivo"]} value={status} onChange={(value) => setStatus(value as StudentStatus)} />
          <ControlledField label="Observaciones" value={observations} onChange={setObservations} placeholder="Sin observaciones" />
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-blue-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">Huella registrada: {student.huellaRegistrada ? "Si" : "No"}</p>
            <p className="text-sm text-slate-500">Permite registrar o reemplazar la huella sin perder historial.</p>
          </div>
          <button onClick={() => onFingerprint(student)} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            Registrar/Reemplazar huella
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 rounded-lg border border-blue-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ ...student, nombre: name, matricula, grado: grade, grupo: group, tutor, telefono, estado: status, observaciones: observations })}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
          >
            Guardar cambios
          </button>
        </div>
      </section>
    </div>
  );
}

function ChangeGroupModal({
  student,
  groupsScope,
  onClose,
  onSave,
}: {
  student: Student;
  groupsScope: Group[];
  onClose: () => void;
  onSave: (student: Student) => void;
}) {
  const [grade, setGrade] = useState<Grade>(student.grado);
  const [group, setGroup] = useState(student.grupo);
  const groupOptions = groupsScope.filter((item) => item.grado === grade).map((item) => item.nombre);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Cambiar grupo</p>
            <h2 className="text-xl font-bold">{student.nombre}</h2>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SelectField label="Grado" options={gradeOrder} value={grade} onChange={(value) => {
            const nextGrade = value as Grade;
            setGrade(nextGrade);
            setGroup(groupsScope.find((item) => item.grado === nextGrade)?.nombre ?? group);
          }} />
          <SelectField label="Grupo" options={groupOptions} value={group} onChange={setGroup} />
        </div>
        <div className="mt-5 rounded-lg border border-blue-100 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-500">Movimiento escolar</p>
          <p className="mt-1 font-bold text-slate-900">
            {student.grupo} a {group}
          </p>
          <p className="mt-1 text-sm text-slate-500">El historial de asistencias y huella se conserva sin cambios.</p>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 rounded-lg border border-blue-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={() => onSave({ ...student, grado: grade, grupo: group })} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            Guardar cambio
          </button>
        </div>
      </section>
    </div>
  );
}

function EditGroupModal({
  group,
  teacher,
  onClose,
  onSave,
}: {
  group: (typeof groups)[number];
  teacher: string;
  onClose: () => void;
  onSave: (teacher: string) => void;
}) {
  const [selectedTeacher, setSelectedTeacher] = useState(teacher);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Editar grupo</p>
            <h2 className="text-xl font-bold">Grupo {group.nombre}</h2>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <SelectField label="Maestro asignado" options={teachers.map((item) => item.nombre)} value={selectedTeacher} onChange={setSelectedTeacher} />
          <div className="rounded-lg border border-blue-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">Organizacion</p>
            <p className="mt-1 font-bold">{group.grado} - Aula {group.aula}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 rounded-lg border border-blue-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={() => onSave(selectedTeacher)} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            Guardar grupo
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-soft">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-amber-50 text-amber-700">
          <UserX size={24} />
        </div>
        <h2 className="mt-4 text-xl font-bold">Confirmar accion</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <p className="mt-2 text-sm text-slate-500">Esta accion puede perder registros asociados en una implementacion real.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className="h-10 rounded-lg border border-blue-100 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={onConfirm} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
            Eliminar
          </button>
        </div>
      </section>
    </div>
  );
}

function BiometricCaptureOverlay({ student }: { student: Student }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-soft">
        <div className="mx-auto grid h-36 w-36 place-items-center rounded-full bg-blue-50">
          <Fingerprint className="fingerprint-pulse text-blue-600" size={76} strokeWidth={1.4} />
        </div>
        <h2 className="mt-5 text-xl font-bold">Capturando huella</h2>
        <p className="mt-2 text-sm text-slate-500">{student.nombre}</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" />
        </div>
        <p className="mt-4 text-sm font-bold text-emerald-700">Captura realizada correctamente</p>
      </section>
    </div>
  );
}

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-12 w-12 place-items-center rounded-lg ${light ? "bg-white text-blue-700" : "bg-blue-600 text-white"}`}>
        <GraduationCap size={26} />
      </div>
      <div>
        <p className={`text-sm font-semibold ${light ? "text-blue-100" : "text-blue-700"}`}>Secundaria</p>
        <h2 className={`${compact ? "text-sm" : "text-base"} font-bold ${light ? "text-white" : "text-slate-950"}`}>BioAsistencia Escolar</h2>
      </div>
    </div>
  );
}

function LoginSignal({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
      <Sparkles size={16} />
      {label}
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "red" | "amber" | "indigo";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <article className="rounded-lg border border-blue-100 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon size={22} />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">{detail}</p>
    </article>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone: "green" | "red" | "amber" | "blue" }) {
  const styles = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className={`rounded-lg p-4 ${styles[tone]}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="font-bold text-slate-950">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-100 px-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function DataTable({
  columns,
  rows,
  badgeColumns = [],
}: {
  columns: string[];
  rows: string[][];
  badgeColumns?: number[];
}) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-blue-100 bg-blue-50/80 text-xs uppercase tracking-wide text-blue-700">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-bold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`} className="border-b border-slate-100 transition hover:bg-slate-50">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                  {badgeColumns.includes(cellIndex) ? <StatusBadge value={cell} /> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgressRow({ label, value, meta }: { label: string; value: number; meta: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-bold text-slate-700">{label}</span>
        <span className="font-semibold text-slate-500">{meta}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all duration-500 ${progressColor(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AttendanceBadge({ value }: { value: number }) {
  return <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${badgeColor(value)}`}>{value}%</span>;
}

function StatusBadge({ value }: { value: string }) {
  const numericPercent = value.endsWith("%") ? Number(value.replace("%", "")) : Number.NaN;
  const styles = !Number.isNaN(numericPercent)
    ? badgeColor(numericPercent)
    :
    value === "Entrada" || value === "Activo" || value === "Si" || value === "Huella registrada"
      ? "bg-emerald-50 text-emerald-700"
      : value === "Retardo" || value === "Sincronizando" || value === "Pendiente"
        ? "bg-amber-50 text-amber-700"
        : value === "No" || value === "Falta" || value === "Inactivo" || value === "Error"
          ? "bg-rose-50 text-rose-700"
          : "bg-blue-50 text-blue-700";
  return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${styles}`}>{value}</span>;
}

function BiometricStatusBadge({ value }: { value: BiometricStatus }) {
  const indicator = {
    "Huella registrada": "bg-emerald-50 text-emerald-700 before:bg-emerald-500",
    Pendiente: "bg-amber-50 text-amber-700 before:bg-amber-500",
    Error: "bg-rose-50 text-rose-700 before:bg-rose-500",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-bold before:h-2 before:w-2 before:rounded-full ${indicator[value]}`}>
      {value}
    </span>
  );
}

function StatusDot({ status }: { status: ReaderStatus }) {
  const styles = {
    Conectado: "bg-emerald-50 text-emerald-700 before:bg-emerald-500",
    Sincronizando: "bg-amber-50 text-amber-700 before:bg-amber-500",
    Desconectado: "bg-rose-50 text-rose-700 before:bg-rose-500",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-bold before:h-2 before:w-2 before:rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "green" }) {
  return (
    <span className={`inline-flex h-10 items-center rounded-lg px-3 text-sm font-bold ${tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
      {label}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-800">{value}</p>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-lg border border-blue-100 bg-slate-50 p-4">
      <p className="font-bold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </article>
  );
}

function FormField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="text-sm font-semibold text-slate-600">
      {label}
      <input className="mt-1 h-11 w-full rounded-lg border border-blue-100 px-3 outline-none focus:border-blue-400" placeholder={placeholder} />
    </label>
  );
}

function ControlledField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-600">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-lg border border-blue-100 px-3 outline-none focus:border-blue-400"
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="mt-1 h-11 w-full rounded-lg border border-blue-100 bg-white px-3 outline-none focus:border-blue-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Toast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="fixed right-4 top-4 z-[60] translate-y-0 opacity-100 transition-all duration-300">
      <div className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-soft">
        <CheckCircle2 size={18} />
        {message}
      </div>
    </div>
  );
}

function sectionTitle(section: Section, role: Role) {
  return roleLabels[role]?.[section] ?? navigation.find((item) => item.id === section)?.label ?? "Dashboard";
}

function readImportCell(row: Record<string, unknown>, column: string) {
  const key = Object.keys(row).find((item) => normalizeHeader(item) === normalizeHeader(column));
  const value = key ? row[key] : "";
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseGrade(value: string): Grade | null {
  const normalized = normalizeHeader(value);
  if (normalized === "1" || normalized.includes("primer")) return "Primer grado";
  if (normalized === "2" || normalized.includes("segundo")) return "Segundo grado";
  if (normalized === "3" || normalized.includes("tercer")) return "Tercer grado";
  return null;
}

function gradeNumber(grade: Grade) {
  return gradeOrder.indexOf(grade) + 1;
}

function progressColor(value: number) {
  if (value >= 95) return "bg-emerald-500";
  if (value >= 80) return "bg-amber-500";
  return "bg-rose-500";
}

function badgeColor(value: number) {
  if (value >= 95) return "bg-emerald-50 text-emerald-700";
  if (value >= 80) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

function reportTone(value: number): "green" | "amber" | "red" {
  if (value >= 95) return "green";
  if (value >= 80) return "amber";
  return "red";
}

function buildStatsShape() {
  return {
    totalAlumnos: 0,
    totalGrupos: 0,
    lectoresConectados: 0,
    asistenciasDia: 0,
    retardos: 0,
    faltas: 0,
    porcentajeGeneral: 0,
    groupRows: groupStats(),
  };
}

function downloadPdfDemo() {
  const lines = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 214 >> stream",
    "BT /F1 18 Tf 72 720 Td (Sistema Biometrico de Asistencia Escolar) Tj",
    "0 -32 Td /F1 12 Tf (Reporte de demostracion generado desde la plataforma.) Tj",
    "0 -22 Td (Presentes, faltas, retardos y porcentaje por grupo disponibles en pantalla.) Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "xref 0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000247 00000 n ",
    "0000000512 00000 n ",
    "trailer << /Root 1 0 R /Size 6 >>",
    "startxref",
    "582",
    "%%EOF",
  ];
  const blob = new Blob([lines.join("\n")], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "reporte-biometrico-demo.pdf";
  link.click();
  URL.revokeObjectURL(url);
}
