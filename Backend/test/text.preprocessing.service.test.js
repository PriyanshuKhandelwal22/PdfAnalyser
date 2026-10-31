const assert = require("node:assert/strict");
const test = require("node:test");

const {
    cleanText,
    extractSkills,
    formatDocumentSections,
    preprocessDocument,
} = require("../src/service/text.preprocessing.service");

test("cleanText normalizes line endings, whitespace, bullets, and invisible controls", () => {
    const cleaned = cleanText("  Summary\r\n  Built an app • Used React\u200B\u0000\r\n\r\n\r\nDone  ");

    assert.equal(cleaned, "Summary\nBuilt an app\n- Used React\n\nDone");
});

test("preprocessDocument identifies sections and retains source and section metadata", () => {
    const document = preprocessDocument({
        text: "Alex Example\nTECHNICAL SKILLS:\n- ReactJS and TypeScript\nWork Experience\nBuilt apps\nEducation\nComputer Science degree",
        source: "resume",
        documentType: "resume",
    });

    assert.deepEqual(document.sections.map(({ section }) => section), [
        "general",
        "skills",
        "experience",
        "education",
    ]);
    assert.ok(document.sections.every(({ source }) => source === "resume"));
    assert.equal(formatDocumentSections(document).includes("## experience\nBuilt apps"), true);
});

test("preprocessDocument detects JD-specific sections", () => {
    const document = preprocessDocument({
        text: "About the Role\nBuild APIs\nRequired Skills:\n- Node.js\nPreferred Skills\n- Kubernetes\nResponsibilities\n- Mentor engineers",
        source: "jobDescription",
        documentType: "jobDescription",
    });

    assert.deepEqual(document.sections.map(({ section }) => section), [
        "jobOverview",
        "requiredSkills",
        "preferredSkills",
        "responsibilities",
    ]);
    assert.ok(document.sections.every(({ source }) => source === "jobDescription"));
});

test("extractSkills canonicalizes explicit aliases and retains evidence provenance", () => {
    const document = preprocessDocument({
        text: "Skills\n- React.js, NodeJS, Postgres, Amazon Web Services, and RESTful API",
        source: "resume",
        documentType: "resume",
    });

    assert.deepEqual(document.skills.map(({ skill }) => skill), [
        "React",
        "Node.js",
        "PostgreSQL",
        "AWS",
        "REST APIs",
    ]);
    assert.ok(document.skills.every(({ source, section, evidence }) =>
        source === "resume" && section === "skills" && evidence.startsWith("- React.js")));
});

test("related skills are not treated as aliases and React Native is not React", () => {
    const sections = [{
        source: "resume",
        section: "experience",
        text: "Express.js experience; API Development; React Native and React projects; JavaScript applications",
    }];

    const skills = extractSkills(sections).map(({ skill }) => skill);

    assert.deepEqual(skills, ["Express.js", "API Development", "React", "JavaScript"]);
    assert.equal(skills.includes("Node.js"), false);
    assert.equal(skills.includes("REST APIs"), false);
    assert.equal(skills.includes("Java"), false);
});

test("empty or non-string input produces no sections or skills", () => {
    const document = preprocessDocument({ text: null, source: "resume" });

    assert.equal(document.text, "");
    assert.deepEqual(document.sections, []);
    assert.deepEqual(document.skills, []);
});
