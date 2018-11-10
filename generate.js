// node generate.js  --date 2018-08-10 --print
// --print / --date are optional

const fs            = require('fs');
const path          = require('path');
const util          = require('util');
const child_process = require('child_process');

const minimist      = require('minimist');
const moment        = require('moment-timezone');
const fetch         = require('node-fetch');
const ical          = require('ical');
const mkdirp        = require('mkdirp');

const mkdirpAsync       = util.promisify(mkdirp);
const fsReadFileAsync   = util.promisify(fs.readFile);
const fsWriteFileAsync  = util.promisify(fs.writeFile);
const execAsync         = util.promisify(child_process.exec);

moment.locale('pl');

const employees = require('./employees.json').employess;

(async () => {
  try {
    const argv = minimist(process.argv.slice(2));

    const datestamp = argv.date ? moment(argv.date) : moment();
    const bankHolidays = await getBankHolidaysByMoment(datestamp);

    const metadata = {
      year: datestamp.year(),
      month: datestamp.format('MMMM'),
      totalHours: getTotalWorkHours(datestamp, bankHolidays),
      days: await getDaysContent(datestamp, bankHolidays),
    };

    for (const employee of employees) {
      const employeeName = `${employee.firstName} ${employee.lastName}`;
      const employeePath = path.join(__dirname, 'employees', employeeName);
      const texFile = path.join(employeePath, `${employeeName}.tex`);
      const pdfFile = path.join(employeePath, `${employeeName}.pdf`);

      console.log(employeeName);

      await mkdirpAsync(employeePath);
      const texContent = await buildEmployeeTex(employee, metadata);
      await fsWriteFileAsync(texFile, texContent);
      await generatePdf(employeePath, texFile);

      if (argv.p === true || argv.print === true) {
        await printFile(pdfFile);
      }
    }
  } catch (err) {
    console.log(err);
  }
})();

async function buildEmployeeTex(employee, metadata) {
  const defaultTitle  = 'LISTA OBECNOŚCI I CZASU PRACY PRACOWNIKÓW';
  const year          = metadata.year;
  const month         = metadata.month;
  const days          = metadata.days;
  const employeeName  = `${employee.firstName} ${employee.lastName}`;
  const title         = employee.title ? employee.title : defaultTitle;

  const templateTexFile = path.join(__dirname, 'template.tex');
  let content = await fsReadFileAsync(templateTexFile, { encoding: 'utf-8' });

  content = content.replace(/<<TITLE>>/g, title);
  content = content.replace(/<<YEAR>>/g, year.toString());
  content = content.replace(/<<MONTH>>/g, month.toString());

  if (employee.hideHours === true) {
    content = content.replace(/<<TOP_TABLE_ROWS>>/g, '');
  } else {
    const totalHours = (metadata.totalHours * employee.time).toFixed(2);
    content = content.replace(/<<TOP_TABLE_ROWS>>/g,
      `wymiar czasu pracy: & ${totalHours} godzin \\`
    );
  }

  content = content.replace(/<<EMPLOYEE>>/g, employeeName);
  content = content.replace(/<<DAYS>>/g, days);

  return content;
}

async function generatePdf(employeePath, texFile) {
  await execAsync(`pdflatex -output-directory="${employeePath}" "${texFile}"`);
  await execAsync(`pdflatex -output-directory="${employeePath}" "${texFile}"`);
}

async function printFile(file) {
  let options = '';
  if (process.platform === 'linux') {
    options = '-o media=a4 -o fit-to-page -o orientation-requested=4';
  }
  await execAsync(`lp ${options} "${file}"`);
}

function getTotalWorkHours(datestamp, bankHolidays) {
  const year = datestamp.year();
  const month = datestamp.month(); // NOTE: month - 1, e.g. Jan is 0
  const daysInMonth = datestamp.daysInMonth();

  let hours = 0;

  for (let date = 1; date <= daysInMonth; date++) {
    if (isWorkDay(moment({ year, month, date }), bankHolidays[date])) {
      hours += 8;
    }
  }

  return hours;
}

async function getDaysContent(datestamp, bankHolidays) {
  const year = datestamp.year();
  const month = datestamp.month(); // NOTE: month - 1, e.g. Jan is 0
  const daysInMonth = datestamp.daysInMonth();

  let content = '';

  for (let date = 1; date <= daysInMonth; date++) {
    const stamp = moment({ year, month, date });
    const color = getDateColor(stamp, bankHolidays[date]);

    content += `\\rowcolor{${color}} \\hline ${date} & ${stamp.format('dd')} & & & & \\\\\n`;
  }

  return content;
}

async function getBankHolidaysByMoment(moment) {
  const year = moment.year();
  const month = moment.month();
  const bankHolidays = {};
  for (const e of await getBankHolidays()) {
    if (e.year === year && e.month === month) {
      bankHolidays[e.date] = e;
    }
  }
  return bankHolidays;
}

async function getBankHolidays() {
  const url = 'https://calendar.google.com/calendar/ical/pl.polish%23holiday%40group.v.calendar.google.com/public/basic.ics';
  const request = await fetch(url);
  const content = await request.text();
  const holidaysICS = Object.values(ical.parseICS(content));

  return holidaysICS.map((entry) => {
    const utctime = moment.tz(entry.start, 'Etc/UTC');
    const localtime = utctime.clone().tz('Europe/Warsaw');
    return {
      year: localtime.year(), month: localtime.month(), date: localtime.date(),
      weekday: localtime.format('ddd'),
      summary: entry.summary
    };
  }).filter((entry) => {
    return (
      entry.summary !== 'Walentynki' &&
      entry.summary !== 'Wielka Sobota' &&
      entry.summary !== 'Wielki Piątek' &&
      entry.summary !== 'Dzień Matki' &&
      entry.summary !== 'Dzień Ojca' &&
      entry.summary !== 'Wigilia Bożego Narodzenia' &&
      entry.summary !== 'Sylwester (święto)'
    );
  });
}

function getDateColor(stamp, holiday) {
  if (stamp.day() === 0 || holiday) {
    return 'Red';
  }
  if (stamp.day() === 6) {
    return 'Green';
  }
  return 'White';
}

function isWorkDay(stamp, holiday) {
  return stamp.day() !== 0 && stamp.day() !== 6 && !holiday;
}
