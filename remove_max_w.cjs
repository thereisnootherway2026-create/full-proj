const fs = require('fs');

// DossierPatient.tsx
let f1 = 'src/pages/dashboard/DossierPatient.tsx';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(/className="max-w-7xl mx-auto /g, 'className="w-full ');
fs.writeFileSync(f1, c1);

// PatientWorkspace.jsx
let f2 = 'src/pages/dashboard/PatientWorkspace.jsx';
let c2 = fs.readFileSync(f2, 'utf8');
c2 = c2.replace(/className="max-w-\[1800px\] mx-auto /g, 'className="w-full ');
c2 = c2.replace(/<main className="flex-1 max-w-\[1800px\] mx-auto /g, '<main className="flex-1 w-full ');
fs.writeFileSync(f2, c2);

// DashboardPage.jsx
let f3 = 'src/pages/DashboardPage.jsx';
let c3 = fs.readFileSync(f3, 'utf8');
c3 = c3.replace(/max-w-\[1320px\]/g, 'w-full');
fs.writeFileSync(f3, c3);
