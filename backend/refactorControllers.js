const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'controllers');

const files = fs.readdirSync(controllersDir);

files.forEach(file => {
  if (!file.endsWith('.js')) return;
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // 1. Replace imports
  content = content.replace(/const [A-Z][a-zA-Z0-9]+ = require\('\.\.\/models\/[A-Z][a-zA-Z0-9]+'\);/g, "const prisma = require('../prismaClient');");
  // Clean up duplicate prisma imports if there were multiple model imports
  let lines = content.split('\n');
  let hasPrisma = false;
  lines = lines.filter(line => {
    if (line.includes("const prisma = require('../prismaClient');")) {
      if (hasPrisma) return false;
      hasPrisma = true;
    }
    return true;
  });
  content = lines.join('\n');

  // We need to identify the model name used in the file.
  // Generally it matches the file name, e.g., customerController.js -> Customer -> prisma.customer
  const modelNameCamel = file.replace('Controller.js', '');
  const modelName = modelNameCamel.charAt(0).toUpperCase() + modelNameCamel.slice(1);
  const prismaModel = modelNameCamel; // lowerCamelCase

  // 2. Replace .find().sort(...)
  content = content.replace(new RegExp(`${modelName}\\.find\\(\\)\\.sort\\(\\{ createdAt: -1 \\}\\)`, 'g'), `prisma.${prismaModel}.findMany({ orderBy: { createdAt: 'desc' } })`);
  content = content.replace(new RegExp(`${modelName}\\.find\\(\\)\\.sort\\(\\{ createdOn: -1 \\}\\)`, 'g'), `prisma.${prismaModel}.findMany({ orderBy: { createdAt: 'desc' } })`);
  content = content.replace(new RegExp(`${modelName}\\.find\\(\\)(?!\\.)`, 'g'), `prisma.${prismaModel}.findMany()`);

  // 3. Replace .findById(req.params.id)
  content = content.replace(new RegExp(`${modelName}\\.findById\\(req\\.params\\.id\\)`, 'g'), `prisma.${prismaModel}.findUnique({ where: { id: req.params.id } })`);
  
  // 4. Replace .findByIdAndUpdate
  content = content.replace(new RegExp(`${modelName}\\.findByIdAndUpdate\\(\\s*req\\.params\\.id,\\s*\\{\\s*\\$set:\\s*req\\.body\\s*\\},\\s*\\{[^}]+\\}\\s*\\)`, 'g'), `prisma.${prismaModel}.update({ where: { id: req.params.id }, data: req.body })`);
  
  // 5. Replace .findByIdAndDelete
  content = content.replace(new RegExp(`${modelName}\\.findByIdAndDelete\\(req\\.params\\.id\\)`, 'g'), `prisma.${prismaModel}.delete({ where: { id: req.params.id } })`);

  // 6. Replace new Model(req.body) and .save()
  // This is trickier with regex. Often it looks like:
  // const newModel = new Model(req.body);
  // const savedModel = await newModel.save();
  // We can convert it to:
  // const savedModel = await prisma.model.create({ data: req.body });
  content = content.replace(new RegExp(`const [a-zA-Z0-9]+ = new ${modelName}\\(req\\.body\\);\\s*const (saved[a-zA-Z0-9]+|created[a-zA-Z0-9]+) = await [a-zA-Z0-9]+\\.save\\(\\);`, 'g'), `const $1 = await prisma.${prismaModel}.create({ data: req.body });`);
  
  // Custom replacements for specific files
  content = content.replace(
    new RegExp(`const [a-zA-Z0-9]+ = new ${modelName}\\(\\{ \\.\\.\\.req\\.body, ([a-zA-Z0-9]+) \\}\\);\\s*const (saved[a-zA-Z0-9]+) = await [a-zA-Z0-9]+\\.save\\(\\);`, 'g'), 
    `const $2 = await prisma.${prismaModel}.create({ data: { ...req.body, $1 } });`
  );

  fs.writeFileSync(filePath, content, 'utf-8');
});

console.log('Controllers refactored successfully');
