// MAPOLY (Moshood Abiola Polytechnic, Abeokuta) academic structure.
// Drives the cascading Faculty → Department dropdowns on registration.
// Faculties are identified by abbreviation; full names are kept for
// verification against the institutional MAPOLY STUDENT table.

export interface MapolyFaculty {
  name: string;
  abbreviation: string;
  departments: string[];
}

export const MAPOLY_FACULTIES: MapolyFaculty[] = [
  {
    name: "School of Business and Management Studies",
    abbreviation: "SBMS",
    departments: [
      "Accountancy",
      "Business Administration and Management",
      "Banking and Finance",
      "Marketing",
      "Public Administration",
      "Purchasing and Supply",
      "Insurance",
      "Human Resource Management",
      "Taxation",
      "Entrepreneurship",
      "Office Technology and Management",
    ],
  },
  {
    name: "School of Communication and Information Technology",
    abbreviation: "SCIT",
    departments: [
      "Mass Communication",
      "Library and Information Science",
      "Printing Technology",
      "Photographic Technology",
      "Film and Television Production",
      "Computer Science",
      "Statistics",
    ],
  },
  {
    name: "School of Engineering",
    abbreviation: "ENG",
    departments: [
      "Civil Engineering",
      "Computer Engineering",
      "Electrical/Electronics Engineering",
      "Mechanical Engineering",
      "Mechatronics Engineering",
      "Agricultural Engineering",
      "Surveying and Geo-informatics",
      "Architecture",
      "Building Technology",
      "Estate Management",
      "Urban and Regional Planning",
      "Quantity Surveying",
      "Architectural Technology",
    ],
  },
  {
    name: "School of Environmental Studies",
    abbreviation: "ENV",
    departments: [
      "Fine and Applied Arts",
      "Industrial Design",
      "Ceramics Technology",
      "Printing Technology",
      "Textile Technology",
    ],
  },
  {
    name: "School of Science and Technology",
    abbreviation: "SST",
    departments: [
      "Science Laboratory Technology",
      "Science Laboratory Technology (Biology/Microbiology)",
      "Science Laboratory Technology (Chemistry)",
      "Science Laboratory Technology (Physics/Electronics)",
      "Food Science and Technology",
      "Nutrition and Dietetics",
      "Hospitality Management",
      "Leisure and Tourism Management",
      "Pharmaceutical Technology",
      "Agricultural Technology",
      "Fisheries Technology",
      "Forestry Technology",
      "Horticultural Technology",
      "Agricultural Extension and Management",
      "Polymer Technology",
      "Community Health",
      "Environmental Health Science",
      "Health Information Management",
      "Dental Therapy",
      "Dental Nursing",
      "Accountancy (Part-Time)",
      "Business Administration (Part-Time)",
      "Public Administration (Part-Time)",
      "Mass Communication (Part-Time)",
      "Computer Science (Part-Time)",
    ],
  },
];

/** Dropdown label — the abbreviation only. */
export function facultyLabel(f: MapolyFaculty): string {
  return f.abbreviation;
}

/** Full school name for an abbreviation (shown as helper text). */
export function facultyFullName(abbreviation: string): string | undefined {
  return MAPOLY_FACULTIES.find(f => f.abbreviation === abbreviation)?.name;
}

/** Resolve a faculty by abbreviation OR full name (verification tolerant). */
export function findFaculty(value: string): MapolyFaculty | undefined {
  const v = String(value || "").trim().toLowerCase();
  return MAPOLY_FACULTIES.find(
    f => f.abbreviation.toLowerCase() === v || f.name.toLowerCase() === v,
  );
}

/** Departments for a faculty given its abbreviation or full name. */
export function getDepartmentsForFaculty(facultyValue: string): string[] {
  return findFaculty(facultyValue)?.departments ?? [];
}

export function getAllDepartments(): string[] {
  return MAPOLY_FACULTIES.flatMap(f => f.departments);
}
