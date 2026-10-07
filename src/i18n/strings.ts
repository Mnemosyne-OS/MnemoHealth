/**
 * strings.ts — everything MnemoHealth says, in the languages it says it in.
 *
 * Same contract as MnemoLaw: the host broadcasts its language, a key missing
 * from a locale falls back to English key by key, and an unknown placeholder
 * stays visible. en / fr / es are written (the product's three core
 * languages); de / pt / ru / zh read English until written.
 *
 * The medical texts themselves are never translated: a memory quotes its
 * source verbatim, in the language the source wrote it in.
 */

export const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'ru', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

const en = {
  'app.subtitle': 'Medical texts from public sources, in your memory',
  'app.advice': 'MnemoHealth quotes medical texts. It gives no medical advice: ask a health professional.',

  'home.lead': 'Choose a domain. Each text enters your memory with its source, its date when the source gives one, and its licence.',
  'home.domain.rare': 'Rare diseases',
  'home.domain.mental': 'Mental health',
  'home.domain.who': 'WHO fact sheets',
  'home.domain.vocab': 'Medical vocabulary',
  'home.domain.research': 'Research (articles)',
  'home.hint.rare': 'Orphanet: one disease and its definition',
  'home.hint.mental': 'NIMH: one topic page',
  'home.hint.who': 'World Health Organization: one fact sheet',
  'home.hint.vocab': 'MeSH: one term and its definition',
  'home.hint.research': 'PMC Open Access: one article, licence per article',
  'home.nothingYet': 'Nothing in memory yet',
  'home.inMemory': '{n} in memory · {date}',

  'nav.back': '← Domains',

  'source.size.orphanet': '{n} diseases (count given by the API on 2026-10-04)',
  'source.size.nimh': '{n} topics on the index page (2026-10-04)',
  'source.size.who': '{n} fact sheets in English, {extra} in French and in Spanish (2026-10-04)',
  'source.size.mesh': 'Searched by term on the NLM API, 25 terms per search',
  'source.size.pmc': '{n} open-access articles (E-utilities, 2026-10-04), searched by subject, 10 per page',
  'source.licence': 'Licence, as written by the source:',
  'source.whoNote': 'The fact sheet page does not state its licence. The sentence below is the WHO copyright policy, verbatim.',
  'source.licenceRead': 'Open the licence page',
  'source.lang': 'Language of the texts',
  'source.langOnly': 'Texts in English only',
  'lang.en': 'English',
  'lang.fr': 'French',
  'lang.es': 'Spanish',

  'list.load': 'Load the list',
  'list.count': '{n} entries',
  'list.filter': 'Find an entry',
  'list.none': 'No entry matches “{q}”.',
  'list.more': '{n} more entries: type a few letters to find one.',
  'list.failed': 'The list could not be read: {why}',

  'search.placeholder.mesh': 'A medical term: diabetes, asthma, migraine…',
  'search.placeholder.pmc': 'A subject: type 2 diabetes, migraine…',
  'search.button': 'Search',
  'search.none': 'Nothing found for “{q}”.',
  'search.total': '{n} results at the source',
  'search.next': 'Next {n}',
  'search.prev': 'Previous',

  'entry.add': 'Add to memory',
  'entry.addAgain': 'Add again',
  'entry.inMemory': 'in memory',
  'entry.noScope': 'no definition',
  'entry.retracted': 'retracted: not added',
  'entry.noRecord': 'record unreadable: {why}',
  'entry.missing': 'no file in the open-access bucket',
  'entry.licence': 'Licence: {licence}',
  'entry.noLicence': 'Licence: license_code empty',

  'all.button': 'Add all {n} to memory',
  'all.resume': 'Resume at {cursor} of {total}',
  'all.complete': 'All {total} entries were read. A new run reads them again.',
  'all.hint': 'One request at a time, with a pause between two. A stop keeps what was written; the next run resumes at the next entry.',
  'all.listed': 'Add the {n} listed to memory',
  'pmc.choose': 'Licences you accept for “add the listed”:',
  'pmc.chooseNone': 'Tick at least one licence to add the listed articles. Each row shows its own licence.',

  'job.listing': 'Reading the list… {elapsed}',
  'job.reading': 'Reading and writing… {done} / {total} · {elapsed}',
  'job.eta': 'about {left} left',
  'job.stop': 'Stop',

  'run.done': '{inVault} entries in memory, {skipped} with nothing to add (no definition, no text, retracted), {failed} refused by the vault.',
  'run.already': '{n} were already in memory.',
  'run.stopped': 'Stopped. The next run resumes after entry {cursor} of {total}.',
  'run.stoppedList': 'Stopped. What was written stays.',
  'run.failed': 'Failed: {why}',
  'run.noKnowledgeRoot': 'Choose where knowledge goes in the Hub that just opened, then add again.',

  'vault.failed': 'The vault is not available: {why}',
  'vault.retry': 'Try again',
  'home.reading': 'Reading what is in memory…',
  'home.unreadable': 'What is in memory could not be read',
  'lib.unreadable': 'The record of what is in memory could not be read ({why}). Nothing will be added until it is read, so that it is never overwritten.',
  'lib.notSaved': 'Not saved: the record of what is in memory was not read yet.',
  'vault.loading': 'Opening the vault… Adding is possible once it is open.',
  'vault.metric': 'Medical texts',
  'footer.folder': 'The copies are kept in {folder}',
  'footer.noFolder': 'The copies are kept in your knowledge folder from the first addition.',
  'footer.open': 'Open the folder',
  'chat.hint': 'To ask a question about these texts, open the chat and tick the source under Knowledge in its scope. The chat quotes the texts with their source.',
};

export type Key = keyof typeof en;
type Dict = Partial<Record<Key, string>>;

const fr: Dict = {
  'app.subtitle': 'Des textes médicaux de sources publiques, dans ta mémoire',
  'app.advice': 'MnemoHealth cite des textes médicaux. Il ne donne aucun conseil médical : demande à un professionnel de santé.',

  'home.lead': 'Choisis un domaine. Chaque texte entre dans ta mémoire avec sa source, sa date quand la source la donne, et sa licence.',
  'home.domain.rare': 'Maladies rares',
  'home.domain.mental': 'Santé mentale',
  'home.domain.who': 'Fiches santé de l’OMS',
  'home.domain.vocab': 'Vocabulaire médical',
  'home.domain.research': 'Recherche (articles)',
  'home.hint.rare': 'Orphanet : une maladie et sa définition',
  'home.hint.mental': 'NIMH : une page de sujet',
  'home.hint.who': 'Organisation mondiale de la santé : une fiche',
  'home.hint.vocab': 'MeSH : un terme et sa définition',
  'home.hint.research': 'PMC Open Access : un article, licence par article',
  'home.nothingYet': 'Rien en mémoire pour l’instant',
  'home.inMemory': '{n} en mémoire · {date}',

  'nav.back': '← Domaines',

  'source.size.orphanet': '{n} maladies (compte donné par l’API le 04/10/2026)',
  'source.size.nimh': '{n} sujets sur la page d’index (04/10/2026)',
  'source.size.who': '{n} fiches en anglais, {extra} en français et en espagnol (04/10/2026)',
  'source.size.mesh': 'Recherche par terme sur l’API de la NLM, 25 termes par recherche',
  'source.size.pmc': '{n} articles en accès ouvert (E-utilities, 04/10/2026), recherche par sujet, 10 par page',
  'source.licence': 'Licence, telle que la source l’écrit :',
  'source.whoNote': 'La page de la fiche ne précise pas sa licence. La phrase ci-dessous est la politique de droits d’auteur de l’OMS, mot pour mot.',
  'source.licenceRead': 'Ouvrir la page de la licence',
  'source.lang': 'Langue des textes',
  'source.langOnly': 'Textes en anglais seulement',
  'lang.en': 'Anglais',
  'lang.fr': 'Français',
  'lang.es': 'Espagnol',

  'list.load': 'Charger la liste',
  'list.count': '{n} entrées',
  'list.filter': 'Trouver une entrée',
  'list.none': 'Aucune entrée ne correspond à « {q} ».',
  'list.more': '{n} entrées de plus : tape quelques lettres pour en trouver une.',
  'list.failed': 'La liste n’a pas pu être lue : {why}',

  'search.placeholder.mesh': 'Un terme médical : diabetes, asthma, migraine…',
  'search.placeholder.pmc': 'Un sujet : type 2 diabetes, migraine…',
  'search.button': 'Chercher',
  'search.none': 'Rien trouvé pour « {q} ».',
  'search.total': '{n} résultats à la source',
  'search.next': '{n} suivants',
  'search.prev': 'Précédents',

  'entry.add': 'Verser en mémoire',
  'entry.addAgain': 'Verser à nouveau',
  'entry.inMemory': 'en mémoire',
  'entry.noScope': 'pas de définition',
  'entry.retracted': 'rétracté : non versé',
  'entry.noRecord': 'fiche illisible : {why}',
  'entry.missing': 'aucun fichier dans le dépôt en accès ouvert',
  'entry.licence': 'Licence : {licence}',
  'entry.noLicence': 'Licence : license_code vide',

  'all.button': 'Verser les {n} en mémoire',
  'all.resume': 'Reprendre à {cursor} sur {total}',
  'all.complete': 'Les {total} entrées ont été lues. Un nouveau passage les relit.',
  'all.hint': 'Une requête à la fois, avec une pause entre deux. Un arrêt garde ce qui est écrit ; le passage suivant reprend à l’entrée suivante.',
  'all.listed': 'Verser les {n} affichés en mémoire',
  'pmc.choose': 'Licences que tu acceptes pour « verser les affichés » :',
  'pmc.chooseNone': 'Coche au moins une licence pour verser les articles affichés. Chaque ligne montre sa propre licence.',

  'job.listing': 'Lecture de la liste… {elapsed}',
  'job.reading': 'Lecture et écriture… {done} / {total} · {elapsed}',
  'job.eta': 'environ {left} restantes',
  'job.stop': 'Arrêter',

  'run.done': '{inVault} entrées en mémoire, {skipped} sans rien à verser (pas de définition, pas de texte, rétracté), {failed} refusées par le coffre.',
  'run.already': '{n} étaient déjà en mémoire.',
  'run.stopped': 'Arrêté. Le prochain passage reprend après l’entrée {cursor} sur {total}.',
  'run.stoppedList': 'Arrêté. Ce qui est écrit reste.',
  'run.failed': 'Échec : {why}',
  'run.noKnowledgeRoot': "Choisis où ranger les connaissances dans le Hub qui vient de s'ouvrir, puis verse à nouveau.",

  'vault.failed': 'Le coffre n’est pas disponible : {why}',
  'vault.retry': 'Réessayer',
  'home.reading': 'Lecture de ce qui est en mémoire…',
  'home.unreadable': 'Ce qui est en mémoire n’a pas pu être lu',
  'lib.unreadable': 'Le registre de ce qui est en mémoire n’a pas pu être lu ({why}). Rien ne sera versé avant qu’il soit lu, pour ne jamais l’écraser.',
  'lib.notSaved': 'Non enregistré : le registre de ce qui est en mémoire n’a pas encore été lu.',
  'vault.loading': 'Ouverture du coffre… Verser sera possible une fois qu’il est ouvert.',
  'vault.metric': 'Textes médicaux',
  'footer.folder': 'Les copies sont rangées dans {folder}',
  'footer.noFolder': 'Les copies sont rangées dans ton dossier des connaissances dès le premier versement.',
  'footer.open': 'Ouvrir le dossier',
  'chat.hint': 'Pour poser une question sur ces textes, ouvre le chat et coche la source sous Connaissances dans sa portée. Le chat cite les textes avec leur source.',
};

const es: Dict = {
  'app.subtitle': 'Textos médicos de fuentes públicas, en tu memoria',
  'app.advice': 'MnemoHealth cita textos médicos. No da ningún consejo médico: consulta a un profesional de la salud.',

  'home.lead': 'Elige un ámbito. Cada texto entra en tu memoria con su fuente, su fecha cuando la fuente la da, y su licencia.',
  'home.domain.rare': 'Enfermedades raras',
  'home.domain.mental': 'Salud mental',
  'home.domain.who': 'Notas descriptivas de la OMS',
  'home.domain.vocab': 'Vocabulario médico',
  'home.domain.research': 'Investigación (artículos)',
  'home.hint.rare': 'Orphanet: una enfermedad y su definición',
  'home.hint.mental': 'NIMH: una página de tema',
  'home.hint.who': 'Organización Mundial de la Salud: una nota descriptiva',
  'home.hint.vocab': 'MeSH: un término y su definición',
  'home.hint.research': 'PMC Open Access: un artículo, licencia por artículo',
  'home.nothingYet': 'Nada en la memoria por ahora',
  'home.inMemory': '{n} en la memoria · {date}',

  'nav.back': '← Ámbitos',

  'source.size.orphanet': '{n} enfermedades (recuento dado por la API el 04/10/2026)',
  'source.size.nimh': '{n} temas en la página de índice (04/10/2026)',
  'source.size.who': '{n} notas en inglés, {extra} en francés y en español (04/10/2026)',
  'source.size.mesh': 'Búsqueda por término en la API de la NLM, 25 términos por búsqueda',
  'source.size.pmc': '{n} artículos en acceso abierto (E-utilities, 04/10/2026), búsqueda por tema, 10 por página',
  'source.licence': 'Licencia, tal como la escribe la fuente:',
  'source.whoNote': 'La página de la nota no indica su licencia. La frase de abajo es la política de derechos de autor de la OMS, palabra por palabra.',
  'source.licenceRead': 'Abrir la página de la licencia',
  'source.lang': 'Idioma de los textos',
  'source.langOnly': 'Textos solo en inglés',
  'lang.en': 'Inglés',
  'lang.fr': 'Francés',
  'lang.es': 'Español',

  'list.load': 'Cargar la lista',
  'list.count': '{n} entradas',
  'list.filter': 'Buscar una entrada',
  'list.none': 'Ninguna entrada corresponde a «{q}».',
  'list.more': '{n} entradas más: escribe unas letras para encontrar una.',
  'list.failed': 'No se pudo leer la lista: {why}',

  'search.placeholder.mesh': 'Un término médico: diabetes, asthma, migraine…',
  'search.placeholder.pmc': 'Un tema: type 2 diabetes, migraine…',
  'search.button': 'Buscar',
  'search.none': 'Nada encontrado para «{q}».',
  'search.total': '{n} resultados en la fuente',
  'search.next': '{n} siguientes',
  'search.prev': 'Anteriores',

  'entry.add': 'Guardar en la memoria',
  'entry.addAgain': 'Guardar de nuevo',
  'entry.inMemory': 'en la memoria',
  'entry.noScope': 'sin definición',
  'entry.retracted': 'retractado: no guardado',
  'entry.noRecord': 'ficha ilegible: {why}',
  'entry.missing': 'ningún archivo en el depósito de acceso abierto',
  'entry.licence': 'Licencia: {licence}',
  'entry.noLicence': 'Licencia: license_code vacío',

  'all.button': 'Guardar las {n} en la memoria',
  'all.resume': 'Reanudar en {cursor} de {total}',
  'all.complete': 'Se leyeron las {total} entradas. Una nueva pasada las vuelve a leer.',
  'all.hint': 'Una petición a la vez, con una pausa entre dos. Una parada conserva lo escrito; la pasada siguiente reanuda en la entrada siguiente.',
  'all.listed': 'Guardar las {n} mostradas en la memoria',
  'pmc.choose': 'Licencias que aceptas para «guardar las mostradas»:',
  'pmc.chooseNone': 'Marca al menos una licencia para guardar los artículos mostrados. Cada fila muestra su propia licencia.',

  'job.listing': 'Leyendo la lista… {elapsed}',
  'job.reading': 'Leyendo y escribiendo… {done} / {total} · {elapsed}',
  'job.eta': 'quedan unos {left}',
  'job.stop': 'Detener',

  'run.done': '{inVault} entradas en la memoria, {skipped} sin nada que guardar (sin definición, sin texto, retractado), {failed} rechazadas por la bóveda.',
  'run.already': '{n} ya estaban en la memoria.',
  'run.stopped': 'Detenido. La próxima pasada reanuda después de la entrada {cursor} de {total}.',
  'run.stoppedList': 'Detenido. Lo escrito se queda.',
  'run.failed': 'Error: {why}',
  'run.noKnowledgeRoot': 'Elige dónde guardar los conocimientos en el Hub que se acaba de abrir y vuelve a guardar.',

  'vault.failed': 'La bóveda no está disponible: {why}',
  'vault.retry': 'Reintentar',
  'home.reading': 'Leyendo lo que hay en la memoria…',
  'home.unreadable': 'No se pudo leer lo que hay en la memoria',
  'lib.unreadable': 'No se pudo leer el registro de lo que hay en la memoria ({why}). No se guardará nada hasta leerlo, para no sobrescribirlo nunca.',
  'lib.notSaved': 'No guardado: el registro de lo que hay en la memoria aún no se ha leído.',
  'vault.loading': 'Abriendo la bóveda… Se podrá guardar cuando esté abierta.',
  'vault.metric': 'Textos médicos',
  'footer.folder': 'Las copias se guardan en {folder}',
  'footer.noFolder': 'Las copias se guardan en tu carpeta de conocimientos desde el primer guardado.',
  'footer.open': 'Abrir la carpeta',
  'chat.hint': 'Para hacer una pregunta sobre estos textos, abre el chat y marca la fuente en Conocimientos de su alcance. El chat cita los textos con su fuente.',
};

/** de / pt / ru / zh are not written yet: those locales read English. */
const DICTS: Record<Lang, Dict> = { en, fr, es, de: {}, pt: {}, ru: {}, zh: {} };

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as readonly string[]).includes(x);
}

/** One string, in one language, with `{placeholders}` filled. A missing key reads English. */
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICTS[lang]?.[key] ?? en[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** For the parity test: every written locale and its dictionary. */
export const WRITTEN: Record<'en' | 'fr' | 'es', Dict> = { en, fr, es };
