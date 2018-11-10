Linux and OSX are supported
Requires pdflatex to be installed

In order to use this please create employees.json file with list of employees.

{
  "employess": [
    { "firstName": "FirstName1", "lastName": "LastName1", "time": 1    },
    { "firstName": "FirstName2", "lastName": "LastName2", "time": 0.5  },
    { "firstName": "FirstName3", "lastName": "LastName3",
      "hideHours": true,
      "title": "Changes default title"
    }
  ]
}

Usage:
node generate.js  --date 2018-08-10 --print

--print - automatically print work records.
--date  - date, if not defined current date is used.
