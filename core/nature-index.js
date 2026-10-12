(function(global) {
  const root = global.PaperPilotCore || {};

  // Canonical Nature Index Journal List (82 core Natural Sciences + Health Sciences)
  // Normalized to lowercase, punctuation stripped, single spaces.
  const NATURE_INDEX_ENTRIES = Object.freeze([
    // Multidisciplinary
    { name: "Nature", aliases: ["nature", "nature london", "nature portfolio", "nature online"] },
    { name: "Science", aliases: ["science", "sci", "science new york n y", "science aaas", "science online"] },
    { name: "Nature Communications", aliases: ["nature communications", "nat commun", "nat commun."] },
    { name: "Science Advances", aliases: ["science advances", "sci adv", "sci adv."] },
    { name: "Proceedings of the National Academy of Sciences", aliases: ["proceedings of the national academy of sciences", "proceedings of the national academy of sciences of the united states of america", "proc natl acad sci u s a", "proc natl acad sci usa", "pnas", "pnas usa"] },

    // Chemistry
    { name: "Accounts of Chemical Research", aliases: ["accounts of chemical research", "acc chem res"] },
    { name: "ACS Central Science", aliases: ["acs central science", "acs cent sci"] },
    { name: "ACS Nano", aliases: ["acs nano"] },
    { name: "Analytical Chemistry", aliases: ["analytical chemistry", "anal chem"] },
    { name: "Angewandte Chemie International Edition", aliases: ["angewandte chemie international edition", "angewandte chemie", "angew chem int ed", "angew chem", "angewandte"] },
    { name: "Chemical Communications", aliases: ["chemical communications", "chem commun", "chem comm"] },
    { name: "Chemical Science", aliases: ["chemical science", "chem sci"] },
    { name: "Chemistry of Materials", aliases: ["chemistry of materials", "chem mater"] },
    { name: "Inorganic Chemistry", aliases: ["inorganic chemistry", "inorg chem"] },
    { name: "Journal of the American Chemical Society", aliases: ["journal of the american chemical society", "j am chem soc", "jacs"] },
    { name: "Macromolecules", aliases: ["macromolecules"] },
    { name: "Nano Letters", aliases: ["nano letters", "nano lett"] },
    { name: "Nature Catalysis", aliases: ["nature catalysis", "nat catal"] },
    { name: "Nature Chemistry", aliases: ["nature chemistry", "nat chem"] },
    { name: "Nature Materials", aliases: ["nature materials", "nat mater"] },
    { name: "Nature Nanotechnology", aliases: ["nature nanotechnology", "nat nanotechnol"] },
    { name: "Organic Letters", aliases: ["organic letters", "org lett"] },
    { name: "The Journal of Physical Chemistry Letters", aliases: ["the journal of physical chemistry letters", "journal of physical chemistry letters", "j phys chem lett"] },

    // Earth & Environmental Sciences
    { name: "Earth and Planetary Science Letters", aliases: ["earth and planetary science letters", "earth planet sci lett"] },
    { name: "Geochimica et Cosmochimica Acta", aliases: ["geochimica et cosmochimica acta", "geochim cosmochim acta"] },
    { name: "Geology", aliases: ["geology"] },
    { name: "Geophysical Research Letters", aliases: ["geophysical research letters", "geophys res lett"] },
    { name: "Global Change Biology", aliases: ["global change biology", "glob change biol", "glob chang biol"] },
    { name: "Journal of Geophysical Research", aliases: [
      "journal of geophysical research", "j geophys res",
      "journal of geophysical research atmospheres", "j geophys res atmos",
      "journal of geophysical research biogeosciences", "j geophys res biogeosci",
      "journal of geophysical research earth surface", "j geophys res earth surf",
      "journal of geophysical research oceans", "j geophys res oceans",
      "journal of geophysical research planets", "j geophys res planets",
      "journal of geophysical research solid earth", "j geophys res solid earth",
      "journal of geophysical research space physics", "j geophys res space phys"
    ]},
    { name: "Limnology and Oceanography", aliases: ["limnology and oceanography", "limnol oceanogr"] },
    { name: "Nature Climate Change", aliases: ["nature climate change", "nat clim change", "nat clim chang"] },
    { name: "Nature Geoscience", aliases: ["nature geoscience", "nat geosci"] },
    { name: "Nature Sustainability", aliases: ["nature sustainability", "nat sustain"] },
    { name: "Water Resources Research", aliases: ["water resources research", "water resour res"] },
    { name: "Paleoceanography and Paleoclimatology", aliases: ["paleoceanography and paleoclimatology", "paleoceanography", "paleoceanogr paleoclimatol"] },
    { name: "Journal of Petrology", aliases: ["journal of petrology", "j petrol"] },

    // Life Sciences
    { name: "American Journal of Human Genetics", aliases: ["american journal of human genetics", "am j hum genet", "ajhg"] },
    { name: "Cancer Cell", aliases: ["cancer cell"] },
    { name: "Cancer Research", aliases: ["cancer research", "cancer res"] },
    { name: "Cell", aliases: ["cell", "cell press"] },
    { name: "Cell Host & Microbe", aliases: ["cell host and microbe", "cell host & microbe", "cell host microbe"] },
    { name: "Cell Metabolism", aliases: ["cell metabolism", "cell metab"] },
    { name: "Cell Stem Cell", aliases: ["cell stem cell"] },
    { name: "Current Biology", aliases: ["current biology", "curr biol"] },
    { name: "Developmental Cell", aliases: ["developmental cell", "dev cell"] },
    { name: "Ecology", aliases: ["ecology"] },
    { name: "Ecology Letters", aliases: ["ecology letters", "ecol lett"] },
    { name: "Genes & Development", aliases: ["genes and development", "genes & development", "genes dev"] },
    { name: "Genome Biology", aliases: ["genome biology", "genome biol"] },
    { name: "Genome Research", aliases: ["genome research", "genome res"] },
    { name: "Immunity", aliases: ["immunity"] },
    { name: "Journal of Cell Biology", aliases: ["journal of cell biology", "j cell biol"] },
    { name: "Journal of Clinical Investigation", aliases: ["journal of clinical investigation", "the journal of clinical investigation", "j clin invest", "jci"] },
    { name: "Journal of Experimental Medicine", aliases: ["journal of experimental medicine", "the journal of experimental medicine", "j exp med", "jem"] },
    { name: "Molecular Cell", aliases: ["molecular cell", "mol cell"] },
    { name: "Molecular Psychiatry", aliases: ["molecular psychiatry", "mol psychiatry"] },
    { name: "Molecular Biology and Evolution", aliases: ["molecular biology and evolution", "mol biol evol"] },
    { name: "The American Naturalist", aliases: ["the american naturalist", "am nat"] },
    { name: "Nature Biotechnology", aliases: ["nature biotechnology", "nat biotechnol", "nat biotech"] },
    { name: "Nature Cell Biology", aliases: ["nature cell biology", "nat cell biol"] },
    { name: "Nature Chemical Biology", aliases: ["nature chemical biology", "nat chem biol"] },
    { name: "Nature Genetics", aliases: ["nature genetics", "nat genet"] },
    { name: "Nature Immunology", aliases: ["nature immunology", "nat immunol"] },
    { name: "Nature Medicine", aliases: ["nature medicine", "nat med"] },
    { name: "Nature Methods", aliases: ["nature methods", "nat methods"] },
    { name: "Nature Microbiology", aliases: ["nature microbiology", "nat microbiol"] },
    { name: "Nature Neuroscience", aliases: ["nature neuroscience", "nat neurosci", "nat neuro"] },
    { name: "Nature Plants", aliases: ["nature plants", "nat plants"] },
    { name: "Nature Ecology & Evolution", aliases: ["nature ecology and evolution", "nature ecology & evolution", "nat ecol evol"] },
    { name: "Nature Structural & Molecular Biology", aliases: ["nature structural and molecular biology", "nature structural & molecular biology", "nat struct mol biol"] },
    { name: "Neuron", aliases: ["neuron"] },
    { name: "PLOS Biology", aliases: ["plos biology", "plos biol"] },
    { name: "Systematic Biology", aliases: ["systematic biology", "syst biol"] },
    { name: "The EMBO Journal", aliases: ["the embo journal", "embo journal", "embo j"] },
    { name: "The ISME Journal", aliases: ["the isme journal", "isme journal", "isme j"] },
    { name: "The Plant Cell", aliases: ["the plant cell", "plant cell"] },

    // Physical Sciences
    { name: "Advanced Functional Materials", aliases: ["advanced functional materials", "adv funct mater"] },
    { name: "Advanced Materials", aliases: ["advanced materials", "adv mater"] },
    { name: "Applied Physics Letters", aliases: ["applied physics letters", "appl phys lett", "apl"] },
    { name: "Astronomy & Astrophysics", aliases: ["astronomy and astrophysics", "astronomy & astrophysics", "astron astrophys", "a&a"] },
    { name: "Monthly Notices of the Royal Astronomical Society", aliases: ["monthly notices of the royal astronomical society", "mon not r astron soc", "mnras"] },
    { name: "Nature Astronomy", aliases: ["nature astronomy", "nat astron"] },
    { name: "Nature Electronics", aliases: ["nature electronics", "nat electron"] },
    { name: "Nature Energy", aliases: ["nature energy", "nat energy"] },
    { name: "Nature Photonics", aliases: ["nature photonics", "nat photon", "nat photonics"] },
    { name: "Nature Physics", aliases: ["nature physics", "nat phys"] },
    { name: "Physical Review A", aliases: ["physical review a", "phys rev a", "pra"] },
    { name: "Physical Review B", aliases: ["physical review b", "phys rev b", "prb"] },
    { name: "Physical Review C", aliases: ["physical review c", "phys rev c", "prc"] },
    { name: "Physical Review D", aliases: ["physical review d", "phys rev d", "prd"] },
    { name: "Physical Review Letters", aliases: ["physical review letters", "phys rev lett", "prl"] },
    { name: "Physical Review X", aliases: ["physical review x", "phys rev x", "prx"] },
    { name: "The Astrophysical Journal", aliases: ["the astrophysical journal", "astrophysical journal", "astrophys j", "apj"] },
    { name: "The Astrophysical Journal Letters", aliases: ["the astrophysical journal letters", "astrophysical journal letters", "astrophys j lett", "apjl"] },
    { name: "The Astrophysical Journal Supplement Series", aliases: ["the astrophysical journal supplement series", "astrophysical journal supplement series", "astrophys j suppl ser", "apjs"] },
    { name: "The European Physical Journal C", aliases: ["the european physical journal c", "european physical journal c", "eur phys j c", "epjc"] },
    { name: "The Journal of High Energy Physics", aliases: ["the journal of high energy physics", "journal of high energy physics", "j high energy phys", "jhep"] },

    // Health Sciences
    { name: "The Lancet", aliases: ["the lancet", "lancet"] },
    { name: "The Lancet Oncology", aliases: ["the lancet oncology", "lancet oncol"] },
    { name: "The Lancet Neurology", aliases: ["the lancet neurology", "lancet neurol"] },
    { name: "The Lancet Infectious Diseases", aliases: ["the lancet infectious diseases", "lancet infect dis"] },
    { name: "JAMA", aliases: ["jama", "journal of the american medical association"] },
    { name: "JAMA Internal Medicine", aliases: ["jama internal medicine", "jama intern med"] },
    { name: "JAMA Oncology", aliases: ["jama oncology", "jama oncol"] },
    { name: "The New England Journal of Medicine", aliases: ["the new england journal of medicine", "new england journal of medicine", "n engl j med", "nejm"] },
    { name: "The BMJ", aliases: ["the bmj", "bmj", "british medical journal"] },
    { name: "Circulation", aliases: ["circulation"] },
    { name: "European Heart Journal", aliases: ["european heart journal", "eur heart j"] },
    { name: "Blood", aliases: ["blood"] },
    { name: "Gut", aliases: ["gut"] },
    { name: "Hepatology", aliases: ["hepatology"] },
    { name: "Journal of the American College of Cardiology", aliases: ["journal of the american college of cardiology", "j am coll cardiol", "jacc"] },
    { name: "Journal of Hepatology", aliases: ["journal of hepatology", "j hepatol"] },
    { name: "Nature Mental Health", aliases: ["nature mental health", "nat ment health"] }
  ]);

  // Specific single-word names that MUST NOT match as substrings in other compound titles
  const SINGLE_WORD_JOURNALS = new Set([
    "nature", "science", "cell", "geology", "blood", "gut", "hepatology",
    "circulation", "ecology", "immunity", "neuron", "macromolecules", "angewandte"
  ]);

  // Negative patterns that are commonly mistaken for NI journals due to keyword collisions
  const KNOWN_NON_NI_PATTERNS = [
    /\bscience of the total environment\b/,
    /\bmaterials science\b/,
    /\bcomputational materials science\b/,
    /\bjournal of materials science\b/,
    /\bfrontiers in\b/,
    /\bscientific reports\b/,
    /\bcellular oncology\b/,
    /\bcellular and molecular\b/,
    /\bcell biology international\b/,
    /\bcell and bioscience\b/,
    /\bstem cell reports\b/,
    /\bengineering geology\b/,
    /\beconomic geology\b/,
    /\bmarine geology\b/,
    /\bsedimentary geology\b/,
    /\bwater science and technology\b/,
    /\benvironmental science\b/,
    /\bcomputer science\b/,
    /\binformation sciences?\b/,
    /\bsocial sciences?\b/,
    /\bbreast cancer research\b/,
    /\bjournal of cancer research and clinical oncology\b/,
    /\bplos one\b/,
    /\bnature and science\b/,
    /\bnature publishing group\b/,
    /\bapplied science\b/,
    /\bcurrent science\b/
  ];

  function normalizeJournalName(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[.:,;()\[\]{}'"`\/\-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Pre-build normalized lookup map: normalized_alias -> canonical_entry
  const NORMALIZED_LOOKUP = new Map();
  for (const entry of NATURE_INDEX_ENTRIES) {
    const canonicalClean = normalizeJournalName(entry.name);
    NORMALIZED_LOOKUP.set(canonicalClean, entry);
    for (const alias of entry.aliases) {
      const aliasClean = normalizeJournalName(alias);
      if (aliasClean) {
        NORMALIZED_LOOKUP.set(aliasClean, entry);
      }
    }
  }

  // List of normalized strings sorted by length descending
  const NATURE_INDEX_LIST = Array.from(NORMALIZED_LOOKUP.keys()).sort((a, b) => b.length - a.length);
  const NATURE_INDEX_JOURNALS = new Set(NATURE_INDEX_LIST);

  function isKnownNonNiPattern(normalized) {
    for (const pattern of KNOWN_NON_NI_PATTERNS) {
      if (pattern.test(normalized)) return true;
    }
    return false;
  }

  function getNatureIndexMatch(journalOrVenue) {
    if (!journalOrVenue) return null;
    const clean = normalizeJournalName(journalOrVenue);
    if (!clean) return null;

    // 1. Blacklist check - immediately reject known false-positive journals
    if (isKnownNonNiPattern(clean)) {
      return null;
    }

    // 2. Exact match check
    if (NORMALIZED_LOOKUP.has(clean)) {
      const entry = NORMALIZED_LOOKUP.get(clean);
      return {
        matched: true,
        canonicalName: entry.name,
        matchedQuery: clean
      };
    }

    // 3. Strict prefix/word boundary check for Nature portfolio (e.g., "nature photonics" or "nature 2021")
    if (clean === "nature" || /^nature(?:\s+\d.*)?$/.test(clean)) {
      const entry = NORMALIZED_LOOKUP.get("nature");
      return { matched: true, canonicalName: entry.name, matchedQuery: clean };
    }
    if (clean.startsWith("nature ")) {
      // Must exactly match one of our approved Nature titles
      for (const entry of NATURE_INDEX_ENTRIES) {
        if (entry.name.toLowerCase().startsWith("nature ")) {
          const entryClean = normalizeJournalName(entry.name);
          if (clean === entryClean || clean.startsWith(entryClean + " ")) {
            return { matched: true, canonicalName: entry.name, matchedQuery: clean };
          }
          for (const alias of entry.aliases) {
            const aliasClean = normalizeJournalName(alias);
            if (aliasClean.startsWith("nature ") && (clean === aliasClean || clean.startsWith(aliasClean + " "))) {
              return { matched: true, canonicalName: entry.name, matchedQuery: clean };
            }
          }
        }
      }
      return null;
    }

    // 4. For single-word journals ("science", "cell", "geology", "blood", "gut", etc.):
    // Allow exact word or word followed immediately by volume/issue/year digits (e.g. "Science 2021", "Cell 184")
    for (const singleWord of SINGLE_WORD_JOURNALS) {
      if (singleWord === "nature") continue;
      const re = new RegExp(`^${singleWord}(?:\\s+\\d.*)?$`);
      if (re.test(clean)) {
        const entry = NORMALIZED_LOOKUP.get(singleWord);
        return { matched: true, canonicalName: entry.name, matchedQuery: clean };
      }
    }

    // 5. For longer multi-word journals (e.g. "Physical Review Letters (PRL)"):
    // Check if the venue contains a multi-word canonical title with boundary
    for (const entry of NATURE_INDEX_ENTRIES) {
      const canonicalClean = normalizeJournalName(entry.name);
      // Skip single-word to avoid loose substring matching
      if (!canonicalClean.includes(" ")) continue;

      if (clean.includes(canonicalClean)) {
        return { matched: true, canonicalName: entry.name, matchedQuery: clean };
      }

      for (const alias of entry.aliases) {
        const aliasClean = normalizeJournalName(alias);
        // Only allow multi-word aliases with length >= 6 for substring matching
        if (aliasClean.includes(" ") && aliasClean.length >= 6 && clean.includes(aliasClean)) {
          return { matched: true, canonicalName: entry.name, matchedQuery: clean };
        }
      }
    }

    return null;
  }

  function isNatureIndex(journalOrVenue) {
    return Boolean(getNatureIndexMatch(journalOrVenue));
  }

  root.natureIndex = {
    isNatureIndex,
    getNatureIndexMatch,
    normalizeJournalName,
    NATURE_INDEX_JOURNALS,
    NATURE_INDEX_LIST,
    NATURE_INDEX_ENTRIES
  };
  global.PaperPilotCore = root;
})(globalThis);
