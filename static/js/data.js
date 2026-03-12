const DEFS = [
  {id:'140L',  name:'140L',       sap:'B-0140',  W:480,  D:560,  H:1070, type:'bin',             wheels:2},
  {id:'240L',  name:'240L',       sap:'B-0240',  W:580,  D:740,  H:1070, type:'bin',             wheels:2},
  {id:'360L',  name:'360L',       sap:'B-0360',  W:625,  D:850,  H:1100, type:'bin',             wheels:2},
  {id:'660L',  name:'660L',       sap:'B-0660',  W:1360, D:770,  H:1180, type:'bin-large',       wheels:4},
  {id:'1000L', name:'1000L',      sap:'B-1000',  W:1320, D:1080, H:1320, type:'bin-xl',          wheels:4},
  {id:'BALEX',   name:'Balex 20',    sap:'', W:1840, D:1100, H:1950, type:'compactor', wheels:0},
  {id:'BALEX10', name:'Balex 10',    sap:'', W:1360, D:840,  H:1920, type:'compactor', wheels:0},
  {id:'BUR',   name:'Bur',        sap:'B-0B-E',  W:1600, D:1200, H:1200, type:'cage',            wheels:4},
];

const WALL_EL_DEFS = {
  'door':        {name:'Dør',         W:900,  D:100, type:'door',   swingR:900},
  'door-double': {name:'Dobbeldør',   W:1800, D:100, type:'door',   swingR:900, double:true},
  'window':      {name:'Vindu',       W:1200, D:200, type:'window'},
  'pillar':      {name:'Søyle',       W:300,  D:300, type:'pillar'},
  'exit':        {name:'Rømningsvei', W:600,  D:600, type:'exit'},
};

// ── Fraksjon-definisjoner ────────────────────────────────────────────────
const FRAKSJONER = [
  { id: 'rest',          label: 'Restavfall',          color: '#2e2e2e', lidColor: '#1a1a1a', textColor: '#fff' },
  { id: 'mat',           label: 'Matavfall',           color: '#4caf50', lidColor: '#2e7d32', textColor: '#fff' },
  { id: 'papir',         label: 'Papir/papp',          color: '#1565c0', lidColor: '#0d47a1', textColor: '#fff' },
  { id: 'plast',         label: 'Plastemballasje',     color: '#8e24aa', lidColor: '#6a1b9a', textColor: '#fff' },
  { id: 'metall',        label: 'Metallemballasje',    color: '#546e7a', lidColor: '#37474f', textColor: '#fff' },
  { id: 'glass',         label: 'Glass/metall',        color: '#5a7a5e', lidColor: '#3d5940', textColor: '#fff' },
  { id: 'farlig',        label: 'Farlig avfall',       color: '#b71c1c', lidColor: '#7f0000', textColor: '#fff' },
  { id: 'ee',            label: 'EE-avfall',           color: '#4a148c', lidColor: '#311b92', textColor: '#fff' },
  { id: 'trevirke',      label: 'Trevirke',            color: '#c62828', lidColor: '#8e1010', textColor: '#fff' },
  { id: 'blandet',       label: 'Blandet kontorpapir', color: '#1565c0', lidColor: '#0d47a1', textColor: '#fff' },
  { id: 'boelgepapp',    label: 'Bølgepapp',           color: '#1976d2', lidColor: '#0d47a1', textColor: '#fff' },
  { id: 'frityrolje',    label: 'Frityrolje',          color: '#388e3c', lidColor: '#1b5e20', textColor: '#fff' },
  { id: 'keramikk',      label: 'Keramikk/porselen',  color: '#212121', lidColor: '#111111', textColor: '#fff' },
  { id: 'plastfolie-farget', label: 'Plastfolie farget', color: '#7b1fa2', lidColor: '#4a148c', textColor: '#fff' },
  { id: 'plastfolie-klar',   label: 'Plastfolie klar',   color: '#7b1fa2', lidColor: '#4a148c', textColor: '#fff' },
];

function getFraksjon(id) {
  return FRAKSJONER.find(f => f.id === id) || FRAKSJONER[0];
}

// ── Sorteringsmerker ────────────────────────────────────────────────────────
// GPN = Grønt Punkt Norge (offisielle ikoner), R2 = NG PDF-ikoner
const GPN = 'https://www.grontpunkt.no/media';
const R2 = 'https://pub-27fd45166dba4be8a488b48df57742df.r2.dev';
const SKILT_DEFS = [
  // Offisielle GPN-ikoner
  { id: 'sk-rest',    name: 'Restavfall',         url: `${GPN}/5mqa5ve3/restavfall_64px.svg`,              iconUrl: `${GPN}/5mqa5ve3/restavfall_64px.svg`              },
  { id: 'sk-papir',  name: 'Kartong og papp',     url: `${GPN}/remntsir/plast_64px.svg`,                  iconUrl: `${GPN}/remntsir/plast_64px.svg`                  },
  { id: 'sk-plast',  name: 'Plastemballasje',     url: `${GPN}/burfzyb5/plastemballasje_64px.svg`,        iconUrl: `${GPN}/burfzyb5/plastemballasje_64px.svg`        },
  { id: 'sk-glass',  name: 'Glassemballasje',     url: `${GPN}/ehkhlw3r/emballasje-glass-materialslag-glassemballasje.svg`, iconUrl: `${GPN}/ehkhlw3r/emballasje-glass-materialslag-glassemballasje.svg` },
  { id: 'sk-metall', name: 'Metallemballasje',    url: `${GPN}/wvfndvhi/metall_64px.svg`,                 iconUrl: `${GPN}/wvfndvhi/metall_64px.svg`                 },
  { id: 'sk-drikke', name: 'Drikkekartong',       url: `${GPN}/uvsflcgw/drikkekartong_64px.svg`,          iconUrl: `${GPN}/uvsflcgw/drikkekartong_64px.svg`          },
  { id: 'sk-farlig', name: 'Farlig avfall',       url: `${GPN}/y5da2wn4/farlig-avfall_64px.svg`,          iconUrl: `${GPN}/y5da2wn4/farlig-avfall_64px.svg`          },
  { id: 'sk-tre',    name: 'Treemballasje',       url: `${GPN}/paylexmu/treemballasje_64px.svg`,           iconUrl: `${GPN}/paylexmu/treemballasje_64px.svg`           },
  // NG PDF-ikoner (ikke tilgjengelig fra GPN)
  { id: 'sk-mat',               name: 'Matavfall',          url: `${R2}/icon-mat.png`,               iconUrl: `${R2}/icon-mat.png`               },
  { id: 'sk-trevirke',          name: 'Trevirke',           url: `${R2}/icon-trevirke.png`,          iconUrl: `${R2}/icon-trevirke.png`          },
  { id: 'sk-boelgepapp',        name: 'Bølgepapp',         url: `${R2}/icon-boelgepapp.png`,        iconUrl: `${R2}/icon-boelgepapp.png`        },
  { id: 'sk-frityrolje',        name: 'Frityrolje',        url: `${R2}/icon-frityrolje.png`,        iconUrl: `${R2}/icon-frityrolje.png`        },
  { id: 'sk-keramikk',          name: 'Keramikk/porselen', url: `${R2}/icon-keramikk.png`,          iconUrl: `${R2}/icon-keramikk.png`          },
  { id: 'sk-plastfolie-farget', name: 'Plastfolie farget', url: `${R2}/icon-plastfolie-farget.png`, iconUrl: `${R2}/icon-plastfolie-farget.png` },
  { id: 'sk-plastfolie-klar',   name: 'Plastfolie klar',   url: `${R2}/icon-plastfolie-klar.png`,   iconUrl: `${R2}/icon-plastfolie-klar.png`   },
  { id: 'sk-ee',                name: 'EE-avfall',          url: `${R2}/icon-ee.png`,                iconUrl: `${R2}/icon-ee.png`                },
  { id: 'sk-blandet',           name: 'Kontorpapir',        url: `${R2}/icon-blandet.png`,           iconUrl: `${R2}/icon-blandet.png`           },
];

const NG_ORANGE = '#E8521A';
const BIN_BODY  = '#3c3c3c';
