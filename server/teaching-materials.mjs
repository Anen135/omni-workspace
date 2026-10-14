// These are the same read requests used by Omni's method-package catalogue.
// They do not require a started lesson, group or attendance record.
export async function loadMaterialsCatalog(section, { form, direction } = {}) {
  return {
    forms: await section('/bind/get-public-form', {}),
    types: await section('/bind/get-materials-type', {}),
    directions: await section('/bind/get-public-direction', { ...(form ? { form } : {}) }),
    packages: await section('/bind/get-public-spec', { ...(form ? { form } : {}), ...(direction ? { direction } : {}), arc: 0 }),
  };
}

export async function loadMethodPackage(section, { spec }) {
  return {
    materials: await section('/bind/get-materials', { spec }),
    themes: await section('/bind/get-count-week', { spec }),
  };
}
