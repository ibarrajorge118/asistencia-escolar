export type Role = "Director" | "Administrativo" | "Maestro";
export type Grade = "Primer grado" | "Segundo grado" | "Tercer grado";
export type StudentStatus = "Activo" | "Inactivo";
export type ReaderStatus = "Conectado" | "Sincronizando" | "Desconectado";
export type AttendanceStatus = "Entrada" | "Retardo" | "Falta";
export type BiometricStatus = "Huella registrada" | "Pendiente" | "Error";

export type Student = {
  id: number;
  nombre: string;
  matricula: string;
  grado: Grade;
  grupo: string;
  estado: StudentStatus;
  huellaRegistrada: boolean;
  estadoBiometrico: BiometricStatus;
  biometricId: string;
  ultimoAcceso: string;
  ultimoLectorId: string;
  tutor?: string;
  telefono?: string;
  observaciones?: string;
};

export type Group = {
  id: number;
  nombre: string;
  grado: Grade;
  tutor: string;
  aula: string;
};

export type AttendanceRecord = {
  id: number;
  alumno: string;
  matricula: string;
  grado: Grade;
  grupo: string;
  fecha: string;
  hora: string;
  lector: string;
  lectorId: string;
  lectorIp: string;
  biometricId: string;
  estado: AttendanceStatus;
};

export type Reader = {
  id: number;
  readerId: string;
  nombre: string;
  ubicacion: string;
  ip: string;
  estado: ReaderStatus;
  ultimaSincronizacion: string;
  ultimaLectura: string;
  firmware: string;
};

export type BiometricLog = {
  id: number;
  fecha: string;
  hora: string;
  readerId: string;
  lectorIp: string;
  biometricId: string;
  evento: string;
  resultado: "OK" | "Advertencia" | "Error";
};

export type Teacher = {
  id: number;
  nombre: string;
  role: "Maestro";
  gruposAsignados: string[];
  permisos: string[];
};

export const roles: Role[] = ["Director", "Administrativo", "Maestro"];

export const gradeOrder: Grade[] = ["Primer grado", "Segundo grado", "Tercer grado"];

const teacherDirectory = [
  "Mtra. Laura Medina",
  "Mtro. Omar Salas",
  "Mtra. Isabel Pineda",
  "Mtro. Rafael Gomez",
  "Mtra. Nadia Cortes",
  "Mtro. Daniel Rivas",
  "Mtra. Karla Bautista",
  "Mtro. Luis Andrade",
  "Mtra. Patricia Nunez",
  "Mtro. Ernesto Molina",
  "Mtra. Gabriela Soto",
  "Mtro. Ricardo Beltran",
];

export const groups: Group[] = gradeOrder.flatMap((grado, gradeIndex) =>
  ["A", "B", "C", "D", "E", "F"].map((letter, letterIndex) => ({
    id: gradeIndex * 6 + letterIndex + 1,
    nombre: `${gradeIndex + 1}${letter}`,
    grado,
    tutor: teacherDirectory[(gradeIndex * 6 + letterIndex) % teacherDirectory.length],
    aula: `${String.fromCharCode(65 + gradeIndex)}-${100 + gradeIndex * 100 + letterIndex + 1}`,
  })),
);

export const teachers: Teacher[] = teacherDirectory.map((nombre, index) => ({
  id: index + 1,
  nombre,
  role: "Maestro",
  gruposAsignados: groups.filter((group) => group.tutor === nombre).map((group) => group.nombre),
  permisos: ["ver_alumnos_asignados", "ver_asistencias", "ver_retardos", "reportes_simples"],
}));

const firstNames = [
  "Ana Sofia",
  "Jose Angel",
  "Camila",
  "Mateo",
  "Valeria",
  "Leonardo",
  "Regina",
  "Emiliano",
  "Ximena",
  "Sebastian",
  "Renata",
  "Santiago",
  "Mariana",
  "Andres",
  "Fernanda",
  "Nicolas",
  "Lucia",
  "Gael",
  "Daniela",
  "Rodrigo",
  "Paula",
  "Iker",
  "Victoria",
  "Alejandro",
  "Sofia",
  "Miguel",
  "Valentina",
  "Jorge",
  "Montserrat",
  "Luis Fernando",
  "Danna",
  "Carlos",
  "Jimena",
  "Pablo",
  "Natalia",
  "Bruno",
];

const lastNames = [
  "Hernandez",
  "Garcia",
  "Martinez",
  "Lopez",
  "Gonzalez",
  "Perez",
  "Rodriguez",
  "Sanchez",
  "Ramirez",
  "Cruz",
  "Flores",
  "Gomez",
  "Morales",
  "Vazquez",
  "Reyes",
  "Jimenez",
  "Torres",
  "Diaz",
  "Ruiz",
  "Mendoza",
  "Aguilar",
  "Castillo",
  "Ortiz",
  "Moreno",
  "Chavez",
  "Rivera",
  "Ramos",
  "Romero",
  "Alvarez",
  "Medina",
];

export const readers: Reader[] = [
  {
    id: 1,
    readerId: "BIO-ENT-01",
    nombre: "Lector entrada 1",
    ubicacion: "Entrada principal",
    ip: "192.168.10.21",
    estado: "Conectado",
    ultimaSincronizacion: "07:32",
    ultimaLectura: "07:31",
    firmware: "v3.8.2",
  },
  {
    id: 2,
    readerId: "BIO-ENT-02",
    nombre: "Lector entrada 2",
    ubicacion: "Entrada principal",
    ip: "192.168.10.22",
    estado: "Conectado",
    ultimaSincronizacion: "07:31",
    ultimaLectura: "07:28",
    firmware: "v3.8.2",
  },
  {
    id: 3,
    readerId: "BIO-ENT-03",
    nombre: "Lector entrada 3",
    ubicacion: "Entrada principal",
    ip: "192.168.10.23",
    estado: "Conectado",
    ultimaSincronizacion: "07:30",
    ultimaLectura: "07:26",
    firmware: "v3.8.1",
  },
  {
    id: 4,
    readerId: "BIO-ENT-04",
    nombre: "Lector entrada 4",
    ubicacion: "Entrada principal",
    ip: "192.168.10.24",
    estado: "Sincronizando",
    ultimaSincronizacion: "07:18",
    ultimaLectura: "07:12",
    firmware: "v3.8.0",
  },
  {
    id: 5,
    readerId: "BIO-ENT-05",
    nombre: "Lector entrada 5",
    ubicacion: "Entrada principal",
    ip: "192.168.10.25",
    estado: "Conectado",
    ultimaSincronizacion: "07:33",
    ultimaLectura: "07:29",
    firmware: "v3.8.2",
  },
  {
    id: 6,
    readerId: "BIO-ENT-06",
    nombre: "Lector entrada 6",
    ubicacion: "Entrada principal",
    ip: "192.168.10.26",
    estado: "Desconectado",
    ultimaSincronizacion: "Ayer 15:42",
    ultimaLectura: "Ayer 15:36",
    firmware: "v3.7.9",
  },
];

function buildStudents() {
  return Array.from({ length: 720 }, (_, index) => {
    const group = groups[index % groups.length];
    const first = firstNames[index % firstNames.length];
    const lastA = lastNames[(index * 3) % lastNames.length];
    const lastB = lastNames[(index * 7 + 5) % lastNames.length];
    const pending = index % 11 === 0;
    const error = index % 47 === 0;
    const hour = 7 + Math.floor((index % 90) / 60);
    const minute = (index * 7) % 60;
    const reader = readers[index % readers.length];

    return {
      id: index + 1,
      nombre: `${first} ${lastA} ${lastB}`,
      matricula: `SEC-${String(2600 + index + 1).padStart(4, "0")}`,
      grado: group.grado,
      grupo: group.nombre,
      estado: index % 83 === 0 ? "Inactivo" : "Activo",
      huellaRegistrada: !pending && !error,
      estadoBiometrico: error ? "Error" : pending ? "Pendiente" : "Huella registrada",
      biometricId: `BIO-STU-${String(index + 1).padStart(5, "0")}`,
      ultimoAcceso: pending ? "Pendiente" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      ultimoLectorId: reader.readerId,
      tutor: `${lastA} ${lastB}`,
      telefono: `81${String(10000000 + index * 37).slice(0, 8)}`,
    } satisfies Student;
  });
}

export const students: Student[] = buildStudents();

export const attendance: AttendanceRecord[] = students.slice(0, 654).map((student, index) => {
  const reader = readers[index % 5];
  return {
    id: index + 1,
    alumno: student.nombre,
    matricula: student.matricula,
    grado: student.grado,
    grupo: student.grupo,
    fecha: "2026-05-29",
    hora: index % 12 === 0 ? `07:${String(14 + (index % 18)).padStart(2, "0")}` : `07:${String((index * 5) % 10).padStart(2, "0")}`,
    lector: reader.nombre,
    lectorId: reader.readerId,
    lectorIp: reader.ip,
    biometricId: student.biometricId,
    estado: index % 12 === 0 ? "Retardo" : "Entrada",
  };
});

export const biometricLogs: BiometricLog[] = attendance.slice(0, 80).map((record, index) => ({
  id: index + 1,
  fecha: record.fecha,
  hora: record.hora,
  readerId: record.lectorId,
  lectorIp: record.lectorIp,
  biometricId: record.biometricId,
  evento: index % 12 === 0 ? "Lectura con retardo" : "Lectura de entrada",
  resultado: index % 29 === 0 ? "Advertencia" : "OK",
}));

export const weeklyAttendance = [
  { dia: "Lun", asistencia: 684, retardos: 28 },
  { dia: "Mar", asistencia: 672, retardos: 34 },
  { dia: "Mie", asistencia: 691, retardos: 24 },
  { dia: "Jue", asistencia: 679, retardos: 31 },
  { dia: "Vie", asistencia: 654, retardos: 47 },
];

export const localServer = {
  nombreInstitucional: "Secundaria Tecnica No. 18",
  modo: "Servidor local escolar",
  servidorActivo: true,
  baseDatosConectada: true,
  lectoresSincronizados: readers.filter((reader) => reader.estado === "Conectado").length,
  ultimaSincronizacion: "Hoy 07:33",
  ipServidor: "192.168.10.10",
  puerto: "3000",
};

export const lastBiometricSync = localServer.ultimaSincronizacion;

export function groupStats() {
  return groups.map((group, index) => {
    const total = students.filter((student) => student.grupo === group.nombre).length;
    const registros = attendance.filter((record) => record.grupo === group.nombre);
    const retardos = registros.filter((record) => record.estado === "Retardo").length + (index % 3);
    const faltas = Math.max(0, total - registros.length);
    const presentes = Math.max(0, total - faltas);
    const porcentaje = Math.round((presentes / total) * 100);

    return {
      ...group,
      total,
      presentes,
      faltas,
      retardos,
      porcentaje,
    };
  });
}
