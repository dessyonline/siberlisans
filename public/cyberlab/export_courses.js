const fs = require('fs');

const code = fs.readFileSync('/Users/melih/Desktop/cyberlab/lessons.js', 'utf-8');

const script = `
global.window = {};
` + code + `
module.exports = { ACADEMY_COURSES };
`;

fs.writeFileSync('./temp_lessons_module.js', script);

try {
    const data = require('./temp_lessons_module.js');
    fs.writeFileSync('/Users/melih/Desktop/magical/Magicai-Server-Files/storage/app/cyber_courses.json', JSON.stringify(data.ACADEMY_COURSES, null, 2));
    console.log("Successfully exported to JSON. Array length:", data.ACADEMY_COURSES.length);
} catch (e) {
    console.error("Error exporting:", e);
}
