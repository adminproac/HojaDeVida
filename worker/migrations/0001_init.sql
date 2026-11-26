-- Hojas de vida. Un documento, personas y sus secciones.
-- Las columnas _en y _es son los textos bilingües. No hay un JSON por persona.

CREATE TABLE document_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version TEXT NOT NULL,
  app_name TEXT,
  default_language TEXT NOT NULL,
  source_note TEXT,
  last_updated TEXT NOT NULL
);

CREATE TABLE document_language (
  meta_id INTEGER NOT NULL REFERENCES document_meta (id),
  language_code TEXT NOT NULL CHECK (language_code IN ('en', 'es')),
  PRIMARY KEY (meta_id, language_code)
);

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  full_name TEXT NOT NULL,
  headline_en TEXT,
  headline_es TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  location_en TEXT,
  location_es TEXT,
  website TEXT,
  photo_url TEXT
);

CREATE INDEX ix_person_sort ON person (sort_order);
CREATE INDEX ix_person_email ON person (email);
CREATE INDEX ix_person_name ON person (full_name);

CREATE TABLE summary_item (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  text_en TEXT NOT NULL,
  text_es TEXT NOT NULL
);

CREATE INDEX ix_summary_person ON summary_item (person_id, sort_order);

CREATE TABLE job (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  section_code TEXT NOT NULL CHECK (section_code IN ('experience', 'otherExperience')),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  company TEXT NOT NULL,
  title_en TEXT,
  title_es TEXT,
  location_en TEXT,
  location_es TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL CHECK (is_current IN (0, 1)),
  date_label_en TEXT,
  date_label_es TEXT
);

CREATE INDEX ix_job_person ON job (person_id, section_code, sort_order);

CREATE TABLE job_highlight (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES job (id),
  sort_order INTEGER NOT NULL,
  text_en TEXT NOT NULL,
  text_es TEXT NOT NULL
);

CREATE INDEX ix_highlight_job ON job_highlight (job_id, sort_order);

CREATE TABLE education_item (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  institution_en TEXT,
  institution_es TEXT,
  credential_en TEXT,
  credential_es TEXT,
  location_en TEXT,
  location_es TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL CHECK (is_current IN (0, 1)),
  date_label_en TEXT,
  date_label_es TEXT
);

CREATE INDEX ix_education_person ON education_item (person_id, sort_order);

CREATE TABLE skill_group (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  category_en TEXT,
  category_es TEXT
);

CREATE INDEX ix_skill_group_person ON skill_group (person_id, sort_order);

CREATE TABLE skill_item (
  id TEXT PRIMARY KEY,
  skill_group_id TEXT NOT NULL REFERENCES skill_group (id),
  sort_order INTEGER NOT NULL,
  name_en TEXT,
  name_es TEXT
);

CREATE INDEX ix_skill_item_group ON skill_item (skill_group_id, sort_order);

CREATE TABLE spoken_language (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  name_en TEXT,
  name_es TEXT,
  level_en TEXT,
  level_es TEXT
);

CREATE INDEX ix_spoken_person ON spoken_language (person_id, sort_order);

CREATE TABLE certification (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  name_en TEXT,
  name_es TEXT,
  issuer TEXT,
  earned_on TEXT,
  url TEXT
);

CREATE INDEX ix_certification_person ON certification (person_id, sort_order);

CREATE TABLE note_item (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person (id),
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  text_en TEXT NOT NULL,
  text_es TEXT NOT NULL
);

CREATE INDEX ix_note_person ON note_item (person_id, sort_order);
