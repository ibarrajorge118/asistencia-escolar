import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord, Grade, Group, Reader, Role, Student } from "@/lib/data";

export type UserProfile = {
  id: string;
  nombre: string;
  email: string;
  rol: Role;
  activo: boolean;
};

function roleFromDb(role: string): Role {
  if (role === "maestro") return "Maestro";
  if (role === "administrativo") return "Administrativo";
  return "Director";
}

export async function getProfile(user: User): Promise<UserProfile> {
  const { data, error } = await supabase.from("usuarios").select("id,nombre,email,rol,activo").eq("id", user.id).single();
  if (error) throw error;
  return { ...data, rol: roleFromDb(data.rol) };
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase.from("alumnos").select("*").order("nombre_completo");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    nombre: row.nombre_completo,
    matricula: row.matricula ?? "",
    grado: row.grado as Grade,
    grupo: row.grupo,
    turno: row.turno,
    estado: row.activo ? "Activo" : "Inactivo",
    huellaRegistrada: Boolean(row.huella_id),
    estadoBiometrico: row.huella_id ? "Huella registrada" : "Pendiente",
    biometricId: row.huella_id ?? "",
    ultimoAcceso: row.ultimo_acceso ?? "Sin registro",
    ultimoLectorId: row.ultimo_lector_id ?? "",
    tutor: row.tutor ?? "",
    telefono: row.telefono ?? "",
    observaciones: row.observaciones ?? "",
  }));
}

export async function saveStudent(student: Omit<Student, "id"> & { id?: number }): Promise<Student> {
  const payload = {
    nombre_completo: student.nombre,
    matricula: student.matricula || null,
    grado: student.grado,
    grupo: student.grupo,
    turno: student.turno,
    tutor: student.tutor || null,
    telefono: student.telefono || null,
    observaciones: student.observaciones || null,
    huella_id: student.biometricId || null,
    activo: student.estado === "Activo",
  };
  const query = student.id
    ? supabase.from("alumnos").update(payload).eq("id", student.id)
    : supabase.from("alumnos").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return (await fetchStudents()).find((item) => item.id === data.id)!;
}

export async function deactivateStudent(id: number) {
  const { error } = await supabase.from("alumnos").update({ activo: false }).eq("id", id);
  if (error) throw error;
}

export async function importStudents(students: Student[]) {
  const payload = students.map((student) => ({
    nombre_completo: student.nombre,
    matricula: student.matricula || null,
    grado: student.grado,
    grupo: student.grupo,
    turno: student.turno,
    tutor: student.tutor || null,
    telefono: student.telefono || null,
    observaciones: student.observaciones || null,
    huella_id: student.biometricId || null,
    activo: student.estado === "Activo",
  }));
  const { error } = await supabase.from("alumnos").insert(payload);
  if (error) throw error;
}

export async function fetchGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from("grupos")
    .select("id,grado,grupo,turno,aula,maestro:usuarios(nombre)")
    .order("grado")
    .order("grupo");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const maestro = row.maestro as unknown as { nombre: string } | { nombre: string }[] | null;
    return {
      id: row.id,
      nombre: row.grupo,
      grado: row.grado as Grade,
      turno: row.turno,
      tutor: Array.isArray(maestro) ? maestro[0]?.nombre ?? "Sin asignar" : maestro?.nombre ?? "Sin asignar",
      aula: row.aula ?? "",
    };
  });
}

export async function fetchAttendance(): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("asistencias")
    .select("id,fecha,hora,tipo,lector_id,alumno:alumnos(nombre_completo,matricula,grado,grupo,huella_id),lector:lectores(nombre,ip)")
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const alumno = Array.isArray(row.alumno) ? row.alumno[0] : row.alumno;
    const lector = Array.isArray(row.lector) ? row.lector[0] : row.lector;
    return {
      id: row.id,
      alumno: alumno?.nombre_completo ?? "Alumno",
      matricula: alumno?.matricula ?? "",
      grado: alumno?.grado as Grade,
      grupo: alumno?.grupo ?? "",
      fecha: row.fecha,
      hora: row.hora,
      lector: lector?.nombre ?? "Registro manual",
      lectorId: row.lector_id ? String(row.lector_id) : "",
      lectorIp: lector?.ip ?? "",
      biometricId: alumno?.huella_id ?? "",
      estado: row.tipo === "retardo" ? "Retardo" : row.tipo === "falta" ? "Falta" : "Entrada",
    };
  });
}

export async function createAuthorizedExit(input: { alumnoId: number; hora: string; motivo: string; autorizadoPor: string }) {
  const { error } = await supabase.from("asistencias").insert({
    alumno_id: input.alumnoId,
    fecha: new Date().toISOString().slice(0, 10),
    hora: input.hora,
    tipo: "salida_autorizada",
    motivo: input.motivo,
    autorizado_por: input.autorizadoPor,
  });
  if (error) throw error;
}

export async function fetchReaders(): Promise<Reader[]> {
  const { data, error } = await supabase.from("lectores").select("*").order("nombre");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    readerId: row.codigo ?? `ZK-${row.id}`,
    nombre: row.nombre,
    ubicacion: row.ubicacion,
    ip: row.ip ?? "",
    estado: row.estado === "conectado" ? "Conectado" : "Desconectado",
    ultimaSincronizacion: row.ultima_conexion ?? "Pendiente",
    ultimaLectura: row.ultima_lectura ?? "Sin lecturas",
    firmware: row.modelo ?? "ZKTeco M2-LR",
  }));
}

export async function fetchUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from("usuarios").select("id,nombre,email,rol,activo").order("nombre");
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, rol: roleFromDb(row.rol) }));
}

export async function saveGroup(group: Omit<Group, "id"> & { id?: number }, maestroId?: string | null) {
  const payload = {
    grado: group.grado,
    grupo: group.nombre,
    turno: group.turno,
    aula: group.aula || null,
    maestro_id: maestroId || null,
    activo: true,
  };
  const query = group.id ? supabase.from("grupos").update(payload).eq("id", group.id) : supabase.from("grupos").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteGroup(id: number) {
  const { error } = await supabase.from("grupos").update({ activo: false }).eq("id", id);
  if (error) throw error;
}

export async function saveReader(reader: Omit<Reader, "id"> & { id?: number }) {
  const payload = {
    codigo: reader.readerId || null,
    nombre: reader.nombre,
    ubicacion: reader.ubicacion,
    ip: reader.ip || null,
    modelo: reader.firmware || "ZKTeco M2-LR",
    estado: reader.estado === "Conectado" ? "conectado" : "desconectado",
  };
  const query = reader.id ? supabase.from("lectores").update(payload).eq("id", reader.id) : supabase.from("lectores").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteReader(id: number) {
  const { error } = await supabase.from("lectores").delete().eq("id", id);
  if (error) throw error;
}
