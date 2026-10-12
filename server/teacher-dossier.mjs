// Verified read requests from Omni's dossierHttp factory.
export async function loadTeacherDossier(section) {
  return {
    single: await section('/dossier/get-single-data', undefined, 'GET'),
    graphics: await section('/dossier/get-data-graphics', undefined, 'GET'),
    all: await section('/dossier/get-all-data', undefined, 'GET'),
  };
}
