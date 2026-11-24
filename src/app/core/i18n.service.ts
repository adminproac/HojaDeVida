import { Injectable, computed, signal } from '@angular/core';
import { Lang, Localized } from './models';

const DICT = {
  appName: { en: 'Résumé Admin', es: 'Admin Hojas de Vida' },
  dashboard: { en: 'Dashboard', es: 'Tablero' },
  people: { en: 'People', es: 'Personas' },
  person: { en: 'Person', es: 'Persona' },
  schema: { en: 'Data schema', es: 'Esquema de datos' },
  home: { en: 'Home', es: 'Inicio' },
  menu: { en: 'Menu', es: 'Menú' },
  management: { en: 'Management', es: 'Administración' },
  tools: { en: 'Tools', es: 'Herramientas' },
  backup: { en: 'Back up JSON', es: 'Respaldar JSON' },
  backupDone: { en: 'Backup created:', es: 'Respaldo creado:' },
  reload: { en: 'Reload from file', es: 'Recargar desde el archivo' },
  reloaded: { en: 'Data reloaded from the JSON file.', es: 'Datos recargados desde el archivo JSON.' },
  language: { en: 'Language', es: 'Idioma' },
  search: { en: 'Search', es: 'Buscar' },
  searchPeople: { en: 'Search by name, e-mail, phone…', es: 'Buscar por nombre, correo, teléfono…' },
  newPerson: { en: 'New person', es: 'Nueva persona' },
  editProfile: { en: 'Edit profile', es: 'Editar perfil' },
  viewResume: { en: 'View résumé', es: 'Ver hoja de vida' },
  resume: { en: 'Résumé', es: 'Hoja de vida' },
  add: { en: 'Add', es: 'Agregar' },
  edit: { en: 'Edit', es: 'Editar' },
  delete: { en: 'Delete', es: 'Eliminar' },
  save: { en: 'Save', es: 'Guardar' },
  saving: { en: 'Saving…', es: 'Guardando…' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  back: { en: 'Back', es: 'Volver' },
  actions: { en: 'Actions', es: 'Acciones' },
  moveUp: { en: 'Move up', es: 'Subir' },
  moveDown: { en: 'Move down', es: 'Bajar' },
  name: { en: 'Name', es: 'Nombre' },
  email: { en: 'E-mail', es: 'Correo' },
  phone: { en: 'Phone', es: 'Teléfono' },
  updated: { en: 'Updated', es: 'Actualizado' },
  jobs: { en: 'Jobs', es: 'Empleos' },
  skills: { en: 'Skills', es: 'Habilidades' },
  studies: { en: 'Studies', es: 'Estudios' },
  languages: { en: 'Languages', es: 'Idiomas' },
  certifications: { en: 'Certifications', es: 'Certificaciones' },
  totalPeople: { en: 'People registered', es: 'Personas registradas' },
  totalJobs: { en: 'Job entries', es: 'Experiencias laborales' },
  totalSkills: { en: 'Skills', es: 'Habilidades' },
  totalStudies: { en: 'Education entries', es: 'Estudios' },
  skillsByCategory: { en: 'Skills by category', es: 'Habilidades por categoría' },
  recentActivity: { en: 'Recently updated', es: 'Actualizados recientemente' },
  welcome: { en: 'Manage the résumés stored in the JSON file.', es: 'Administre las hojas de vida guardadas en el archivo JSON.' },
  dataFile: { en: 'Data file', es: 'Archivo de datos' },
  noPeople: { en: 'No people match your search.', es: 'Ninguna persona coincide con la búsqueda.' },
  noItems: { en: 'No records yet.', es: 'Aún no hay registros.' },
  confirmTitle: { en: 'Please confirm', es: 'Confirme por favor' },
  confirmDeletePerson: { en: 'Delete {name} and their whole résumé? This cannot be undone.', es: '¿Eliminar a {name} y toda su hoja de vida? Esta acción no se puede deshacer.' },
  confirmDeleteItem: { en: 'Delete this record from "{section}"? This cannot be undone.', es: '¿Eliminar este registro de "{section}"? Esta acción no se puede deshacer.' },
  yesDelete: { en: 'Yes, delete', es: 'Sí, eliminar' },
  deleted: { en: 'Deleted.', es: 'Eliminado.' },
  saved: { en: 'Saved to the JSON file.', es: 'Guardado en el archivo JSON.' },
  created: { en: 'Created in the JSON file.', es: 'Creado en el archivo JSON.' },
  apiDown: { en: 'Cannot reach the API. Start the project with "npm start" (it runs the API and Angular together).', es: 'No se puede conectar con la API. Inicie el proyecto con "npm start" (ejecuta la API y Angular juntos).' },
  retry: { en: 'Retry', es: 'Reintentar' },
  loading: { en: 'Loading…', es: 'Cargando…' },
  notFound: { en: 'Record not found.', es: 'Registro no encontrado.' },
  required: { en: 'This field is required.', es: 'Este campo es obligatorio.' },
  maxLength: { en: 'Maximum {max} characters.', es: 'Máximo {max} caracteres.' },
  fmt_email: { en: 'Enter a valid e-mail address.', es: 'Ingrese un correo electrónico válido.' },
  fmt_phone: { en: 'Use digits, spaces and + ( ) - . (7 to 30 characters).', es: 'Use dígitos, espacios y + ( ) - . (de 7 a 30 caracteres).' },
  fmt_url: { en: 'Enter a URL starting with http:// or https://', es: 'Ingrese una URL que comience con http:// o https://' },
  'fmt_YYYY-MM': { en: 'Use the format YYYY-MM.', es: 'Use el formato AAAA-MM.' },
  fmt_default: { en: 'Invalid format.', es: 'Formato no válido.' },
  dateRange: { en: 'The end date must be after the start date.', es: 'La fecha de finalización debe ser posterior a la de inicio.' },
  min: { en: 'Minimum value: {min}.', es: 'Valor mínimo: {min}.' },
  formInvalid: { en: 'Please fix the highlighted fields.', es: 'Corrija los campos marcados.' },
  serverError: { en: 'The server returned an error:', es: 'El servidor devolvió un error:' },
  copyEnToEs: { en: 'Copy EN → ES', es: 'Copiar EN → ES' },
  copyEsToEn: { en: 'Copy ES → EN', es: 'Copiar ES → EN' },
  addRow: { en: 'Add row', es: 'Agregar fila' },
  remove: { en: 'Remove', es: 'Quitar' },
  position: { en: 'Position (order)', es: 'Posición (orden)' },
  present: { en: 'Present', es: 'Actualidad' },
  newItem: { en: 'New record', es: 'Nuevo registro' },
  editItem: { en: 'Edit record', es: 'Editar registro' },
  field: { en: 'Field', es: 'Campo' },
  label: { en: 'Label', es: 'Etiqueta' },
  type: { en: 'Type', es: 'Tipo' },
  localized: { en: 'Bilingual', es: 'Bilingüe' },
  requiredCol: { en: 'Required', es: 'Obligatorio' },
  size: { en: 'Max. size', es: 'Tamaño máx.' },
  format: { en: 'Format', es: 'Formato' },
  yes: { en: 'Yes', es: 'Sí' },
  no: { en: 'No', es: 'No' },
  schemaIntro: { en: 'Fields, attributes and sizes of each section of resume-data.json. The forms validate with these rules and so does the API.', es: 'Campos, atributos y tamaños de cada sección de resume-data.json. Los formularios y la API validan con estas reglas.' },
  sections: { en: 'Sections', es: 'Secciones' },
  records: { en: 'records', es: 'registros' },
  contact: { en: 'Contact', es: 'Contacto' },
  print: { en: 'Print', es: 'Imprimir' },
  createdAt: { en: 'Created', es: 'Creado' },
} satisfies Record<string, Localized>;

export type DictKey = keyof typeof DICT;
const STORAGE_KEY = 'resume-admin.lang';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>((localStorage.getItem(STORAGE_KEY) as Lang) || 'es');
  readonly other = computed<Lang>(() => (this.lang() === 'es' ? 'en' : 'es'));

  constructor() {
    document.documentElement.lang = this.lang();
  }

  setLang(lang: Lang) {
    this.lang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }

  /** UI label from the dictionary, with {placeholders}. */
  t(key: DictKey | string, params?: Record<string, unknown>): string {
    const entry = (DICT as Record<string, Localized>)[key];
    let text = entry ? entry[this.lang()] : key;
    if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v));
    return text;
  }

  /** Text of a localized value {en, es}; falls back to the other language. */
  loc(value: Localized | string | null | undefined): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return value[this.lang()] || value[this.other()] || '';
  }

  /** "Aug 2022" / "ago 2022" from YYYY-MM. */
  month(value: string | null | undefined): string {
    if (!value) return '';
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return value;
    const name = new Intl.DateTimeFormat(this.lang() === 'es' ? 'es-CO' : 'en-US', { month: 'short' }).format(new Date(y, m - 1, 1));
    return `${name.replace('.', '')} ${y}`;
  }

  dateTime(value: string | null | undefined): string {
    if (!value) return '';
    return new Intl.DateTimeFormat(this.lang() === 'es' ? 'es-CO' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
}
