const SKILL_CATALOG = [
    { skill: "JavaScript", aliases: ["JavaScript", "JavaScript ES6", "ECMAScript", "JS"] },
    { skill: "TypeScript", aliases: ["TypeScript", "TS"] },
    { skill: "React", aliases: ["React.js", "ReactJS", "React"] },
    { skill: "Next.js", aliases: ["Next.js", "NextJS"] },
    { skill: "Node.js", aliases: ["Node.js", "NodeJS", "Node.js runtime", "Node runtime", "Node"] },
    { skill: "Express.js", aliases: ["Express.js", "ExpressJS", "Express"] },
    { skill: "REST APIs", aliases: ["RESTful APIs", "RESTful API", "REST APIs", "REST API"] },
    { skill: "API Development", aliases: ["API Development", "API Design"] },
    { skill: "Frontend Development", aliases: ["Frontend Development", "Front-End Development", "Front End Development"] },
    { skill: "GraphQL", aliases: ["GraphQL"] },
    // ML is an established abbreviation in skill contexts. CPP is deliberately
    // not an alias for C++ because it is ambiguous outside that context.
    { skill: "Machine Learning", aliases: ["Machine Learning", "Machine-Learning", "ML"] },
    { skill: "MongoDB", aliases: ["MongoDB"] },
    { skill: "PostgreSQL", aliases: ["PostgreSQL", "Postgres"] },
    { skill: "MySQL", aliases: ["MySQL"] },
    { skill: "Redis", aliases: ["Redis"] },
    { skill: "Docker", aliases: ["Docker"] },
    { skill: "Kubernetes", aliases: ["Kubernetes", "K8s"] },
    { skill: "AWS", aliases: ["AWS", "Amazon Web Services"] },
    { skill: "Azure", aliases: ["Azure", "Microsoft Azure"] },
    { skill: "Google Cloud", aliases: ["Google Cloud Platform", "Google Cloud", "GCP"] },
    { skill: "Python", aliases: ["Python"] },
    { skill: "TensorFlow", aliases: ["TensorFlow"] },
    { skill: "PyTorch", aliases: ["PyTorch"] },
    { skill: "Java", aliases: ["Java"] },
    { skill: "C++", aliases: ["C++"] },
    { skill: "C#", aliases: ["C#", "C Sharp"] },
    { skill: "SQL", aliases: ["SQL"] },
    { skill: "HTML", aliases: ["HTML5", "HTML"] },
    { skill: "CSS", aliases: ["CSS3", "CSS"] },
    { skill: "Sass", aliases: ["Sass", "SCSS"] },
    { skill: "Tailwind CSS", aliases: ["Tailwind CSS", "Tailwind"] },
    { skill: "Redux", aliases: ["Redux"] },
    { skill: "Jest", aliases: ["Jest"] },
    { skill: "Git", aliases: ["Git"] },
    { skill: "GitHub Actions", aliases: ["GitHub Actions"] },
    { skill: "CI/CD", aliases: ["CI/CD", "CI CD", "Continuous Integration", "Continuous Delivery"] },
    { skill: "Agile", aliases: ["Agile"] },
    { skill: "Scrum", aliases: ["Scrum"] },
];

function normalizeSkillKey(value) {
    return value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}+#]/gu, "");
}

const SKILL_ALIAS_LOOKUP = new Map(
    SKILL_CATALOG.flatMap(({ skill, aliases }) => aliases.map((alias) => [normalizeSkillKey(alias), skill])),
);

function canonicalizeSkill(value) {
    if (typeof value !== "string" || !value.trim()) {
        return "";
    }

    const trimmedValue = value.trim();
    return SKILL_ALIAS_LOOKUP.get(normalizeSkillKey(trimmedValue)) || trimmedValue;
}

function deduplicateSkills(skills) {
    if (!Array.isArray(skills)) {
        return [];
    }

    const grouped = new Map();
    for (const skill of skills) {
        if (!skill || typeof skill.skill !== "string" || !skill.skill.trim()) {
            continue;
        }
        const canonicalSkill = canonicalizeSkill(skill.skill);
        const key = normalizeSkillKey(canonicalSkill);
        const originalEvidence = Array.isArray(skill.evidenceItems) && skill.evidenceItems.length
            ? skill.evidenceItems
            : [{
                matchedText: skill.matchedText || skill.skill,
                source: skill.source || null,
                section: skill.section || null,
                evidence: skill.evidence || null,
            }];
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                ...skill,
                skill: canonicalSkill,
                evidenceItems: originalEvidence.map((item) => ({ ...item })),
            });
        } else {
            existing.evidenceItems.push(...originalEvidence.map((item) => ({ ...item })));
        }
    }

    return [...grouped.values()];
}

const SECTION_ALIASES = {
    summary: ["summary", "professional summary", "profile", "professional profile", "career objective", "objective"],
    skills: ["skills", "technical skills", "core skills", "skills and technologies", "technical skills and tools", "technologies"],
    experience: ["experience", "work experience", "professional experience", "employment history", "work history"],
    projects: ["projects", "selected projects", "personal projects"],
    education: ["education", "academic background", "academic qualifications"],
    achievements: ["achievements", "awards", "honors", "honours"],
    certifications: ["certifications", "certificates", "licenses", "licences"],
    publications: ["publications", "patents"],
    responsibilities: ["responsibilities", "key responsibilities", "what you will do", "what you will be doing", "duties"],
    requiredSkills: ["required skills", "must have skills", "must haves", "required technologies", "core requirements"],
    preferredSkills: ["preferred skills", "nice to have skills", "nice to haves", "preferred technologies"],
    qualifications: ["qualifications", "requirements", "required qualifications", "preferred qualifications", "what you bring"],
    jobOverview: ["about the role", "role overview", "job overview", "about the job", "position overview"],
};

const JOB_DESCRIPTION_SECTIONS = new Set([
    "responsibilities",
    "requiredSkills",
    "preferredSkills",
    "qualifications",
    "jobOverview",
]);

function cleanText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .normalize("NFKC")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\r\n?/g, "\n")
        .replace(/[•▪◦]/g, "\n- ")
        .split("\n")
        .map((line) => line.replace(/[\t ]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeHeader(value) {
    return value
        .replace(/^\s*#+\s*/, "")
        .replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, "")
        .replace(/\s*[:\-–—]+\s*$/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and");
}

function getSectionForHeader(line, documentType) {
    const header = normalizeHeader(line);
    if (!header || header.length > 80) {
        return null;
    }

    for (const [section, aliases] of Object.entries(SECTION_ALIASES)) {
        if (aliases.some((alias) => normalizeHeader(alias) === header)) {
            if (documentType === "jobDescription" && !JOB_DESCRIPTION_SECTIONS.has(section) && section !== "skills") {
                return null;
            }
            if (documentType !== "jobDescription" && JOB_DESCRIPTION_SECTIONS.has(section)) {
                return null;
            }
            return section;
        }
    }

    return null;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAlias(alias, text) {
    const pattern = escapeRegExp(alias).replace(/\s+/g, "\\s+");
    const notReactNative = /^react$/i.test(alias) ? "(?!\\s+native\\b)" : "";
    const leftBoundary = /^js$/i.test(alias) ? "(^|[^a-z0-9.])" : "(^|[^a-z0-9])";
    const expression = new RegExp(`${leftBoundary}(${pattern})${notReactNative}(?=$|[^a-z0-9])`, "i");
    const match = expression.exec(text);

    if (!match) {
        return null;
    }

    return {
        matchedText: match[2],
        position: match.index + match[1].length,
    };
}

function extractSkills(sections) {
    if (!Array.isArray(sections)) {
        return [];
    }

    const evidence = [];
    for (const section of sections) {
        for (const line of section.text.split("\n")) {
            if (!line.trim()) {
                continue;
            }

            const lineEvidence = [];
            for (const entry of SKILL_CATALOG) {
                const aliases = [...entry.aliases].sort((left, right) => right.length - left.length);
                let aliasMatch = null;
                for (const alias of aliases) {
                    aliasMatch = findAlias(alias, line);
                    if (aliasMatch) {
                        break;
                    }
                }

                if (aliasMatch) {
                    lineEvidence.push({
                        position: aliasMatch.position,
                        record: {
                            skill: entry.skill,
                            matchedText: aliasMatch.matchedText,
                            source: section.source,
                            section: section.section,
                            evidence: line.trim(),
                        },
                    });
                }
            }
            lineEvidence.sort((left, right) => left.position - right.position);
            evidence.push(...lineEvidence.map(({ record }) => record));
        }
    }

    return evidence;
}

function preprocessDocument({ text, source = "unknown", documentType = "resume" } = {}) {
    const cleanedText = cleanText(text);
    const sections = [];
    let currentSection = "general";
    let currentLines = [];

    function saveSection() {
        const sectionText = currentLines.join("\n").trim();
        if (sectionText) {
            sections.push({ source, section: currentSection, text: sectionText });
        }
        currentLines = [];
    }

    for (const line of cleanedText.split("\n")) {
        const detectedSection = getSectionForHeader(line, documentType);
        if (detectedSection) {
            saveSection();
            currentSection = detectedSection;
        } else {
            currentLines.push(line);
        }
    }
    saveSection();

    return {
        source,
        documentType,
        text: cleanedText,
        sections,
        skills: extractSkills(sections),
    };
}

function formatDocumentSections(document) {
    return document.sections
        .map(({ section, text }) => `## ${section}\n${text}`)
        .join("\n\n");
}

module.exports = {
    canonicalizeSkill,
    cleanText,
    deduplicateSkills,
    extractSkills,
    formatDocumentSections,
    normalizeSkillKey,
    preprocessDocument,
};
