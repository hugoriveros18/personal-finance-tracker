# Sample import data

Import [test-finance-data.json](test-finance-data.json) through **Backup → Import data**
(Spanish: **Respaldo → Importar datos**). It uses the application's `pft-export-v2` format.

The file contains three accounts with fictional opening balances, eleven expense categories
and the `Salario` income category. It contains no transactions, movements or liability payments.

| Account     | Available balance (COP) |
| ----------- | ----------------------: |
| Bancolombia |               2,000,000 |
| Davivienda  |               1,000,000 |
| Nu          |                 500,000 |

Amounts in JSON are integer cents: 2,000,000 COP is `200000000`. Savings and liabilities start
at zero. Opening balances let you test expenses immediately without creating income records.
No default account is preset; choose one from the Accounts screen if desired.

Select **Validate without importing** first to check the file. Then turn that option off and
select the file again to import. The expected summary is 3 accounts, 12 categories and zero
financial events. The **Merge** mode preserves existing records and fails on duplicate account
or category names. The default **Replace current data** mode deletes existing financial data
for the signed-in user before loading the file.

The current backup contract also requires a profile. This sample sets the display name to
`Demo User`, the language to Spanish and the theme to light. Edit the `user.firstName`,
`user.lastName`, `user.preferredLanguage` and `user.preferredTheme` fields before importing if
you want to preserve your current profile values. The importer does not change your sign-in
email or password; the sample email is only backup metadata.
