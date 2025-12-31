# Document Placeholders Reference

This document lists all available placeholders for each document section in the Office Management System.

## Important Notes

- **Format**: Placeholders use curly braces: `{placeholder_name}`
- **Case Sensitive**: Placeholders are case-sensitive (use exact spelling)
- **Optional Fields**: Some placeholders are optional and will be empty if not provided
- **Auto-generated**: `{ref.no}` is automatically generated based on the Reference Period

---

## 1. Offer Letter

### Available Placeholders:

| Placeholder | Description | Required | Maps From |
|------------|-------------|----------|-----------|
| `{date}` | Letter date | ✅ Yes | Date field |
| `{employee_name}` | Full name of the employee | ✅ Yes | Employee Name field |
| `{address}` | Full address of employee | ✅ Yes | Address field |
| `{job_title}` | Job title/position | ✅ Yes | Job Title field |
| `{joining_date}` | Employee joining date | ✅ Yes | Joining Date field |
| `{signatory_name}` | Name of person signing the letter | ✅ Yes | Signatory Name field |
| `{ref.no}` | Auto-generated reference number | ✅ Yes | Generated from Reference Period |

### Additional Backend Placeholders (also supported):

| Placeholder | Description | Source |
|------------|-------------|--------|
| `{name}` | Same as `{employee_name}` | Employee Name field |
| `{role}` | Same as `{job_title}` | Job Title field |
| `{start_date}` | Same as `{joining_date}` | Joining Date field |
| `{end_date}` | Same as `{joining_date}` | Joining Date field |
| `{letter_date}` | Same as `{date}` | Date field |
| `{address}` | Employee address | Address field |
| `{phone_number}` | Phone number (defaults to "N/A") | Not used in Offer Letter |

### Template Example:
```
Date: {date}
To: {employee_name}
Address: {address}

We are pleased to offer you the position of {job_title}...
Your joining date will be {joining_date}.

Reference No: {ref.no}

{signatory_name}
```

---

## 2. Internship Certificate / Letter

### Available Placeholders:

| Placeholder | Description | Required | Maps From |
|------------|-------------|----------|-----------|
| `{date}` | Letter date | ✅ Yes | Date field |
| `{ref_no}` | Reference number (manual or auto) | ✅ Yes | Ref No field (but {ref.no} is auto-generated) |
| `{intern_name}` | Full name of the intern | ✅ Yes | Intern Name field |
| `{internship_duration}` | Duration of internship | ✅ Yes | Internship Duration field |
| `{start_date}` | Internship start date | ✅ Yes | Start Date field |
| `{end_date}` | Internship end date | ✅ Yes | End Date field |
| `{intern_role}` | Intern's role/position | ✅ Yes | Intern Role field |
| `{work_area_1}` | First work area | ✅ Yes | Work Area 1 field |
| `{work_area_2}` | Second work area | ✅ Yes | Work Area 2 field |
| `{signatory_name}` | Name of signatory | ✅ Yes | Signatory Name field |
| `{signatory_designation}` | Designation of signatory | ✅ Yes | Signatory Designation field |
| `{ref.no}` | Auto-generated reference number | ✅ Yes | Generated from Reference Period |

### Additional Backend Placeholders (also supported):

| Placeholder | Description | Source |
|------------|-------------|--------|
| `{name}` | Same as `{intern_name}` | Intern Name field |
| `{role}` | Same as `{intern_role}` | Intern Role field |
| `{letter_date}` | Same as `{date}` | Date field |
| `{address}` | Address (defaults to empty) | Not used in Internship Letter |
| `{phone_number}` | Phone number (defaults to "N/A") | Not used in Internship Letter |

### Template Example:
```
Date: {date}
Reference No: {ref_no} or {ref.no}

This is to certify that {intern_name} has successfully completed 
an internship of {internship_duration} from {start_date} to {end_date} 
as {intern_role}.

Work Areas:
- {work_area_1}
- {work_area_2}

{signatory_name}
{signatory_designation}
```

---

## 3. Experience Letter

### Available Placeholders:

| Placeholder | Description | Required | Maps From |
|------------|-------------|----------|-----------|
| `{name}` | Full name of the employee | ✅ Yes | Candidate Name field |
| `{role}` | Job role/position | ✅ Yes | Role/Position field |
| `{start_date}` | Employment start date | ✅ Yes | Employee Joining Date field |
| `{end_date}` | Employment end date | ✅ Yes | Employee Resignation Date field |
| `{letter_date}` | Letter date | ⚠️ Optional | Letter Date field (defaults to today) |
| `{address}` | Employee address | ⚠️ Optional | Address field |
| `{phone_number}` | Phone number | ⚠️ Optional | Phone Number field (defaults to "N/A") |
| `{ref.no}` | Auto-generated reference number | ✅ Yes | Generated from Reference Period |
| `{signatory_name}` | Name of signatory | ⚠️ Optional | Signatory Name field |

### Template Example:
```
Date: {letter_date}

To Whom It May Concern,

This is to certify that {name} worked with us as {role} 
from {start_date} to {end_date}.

Contact Details:
Address: {address}
Phone: {phone_number}

Reference No: {ref.no}

{signatory_name}
```

---

## 4. Relieving Letter

### Available Placeholders:

| Placeholder | Description | Required | Maps From |
|------------|-------------|----------|-----------|
| `{date}` | Letter date | ✅ Yes | Date field |
| `{ref_no}` | Reference number (manual or auto) | ✅ Yes | Ref No field (but {ref.no} is auto-generated) |
| `{employee_name}` | Full name of the employee | ✅ Yes | Employee Name field |
| `{resignation_date}` | Date of resignation | ✅ Yes | Employee Resignation Date field |
| `{relieving_date}` | Date of relieving | ✅ Yes | Relieving Date field |
| `{employment_start_date}` | Employment start date | ✅ Yes | Employee Joining Date field |
| `{employee_designation}` | Employee's designation | ✅ Yes | Employee Designation field |
| `{signatory_name}` | Name of signatory | ✅ Yes | Signatory Name field |
| `{signatory_designation}` | Designation of signatory | ✅ Yes | Signatory Designation field |
| `{ref.no}` | Auto-generated reference number | ✅ Yes | Generated from Reference Period |

### Additional Backend Placeholders (also supported):

| Placeholder | Description | Source |
|------------|-------------|--------|
| `{name}` | Same as `{employee_name}` | Employee Name field |
| `{role}` | Same as `{employee_designation}` | Employee Designation field |
| `{start_date}` | Same as `{employment_start_date}` | Employee Joining Date field |
| `{end_date}` | Same as `{relieving_date}` | Relieving Date field |
| `{letter_date}` | Same as `{date}` | Date field |
| `{address}` | Address (defaults to empty) | Not used in Relieving Letter |
| `{phone_number}` | Phone number (defaults to "N/A") | Not used in Relieving Letter |

### Template Example:
```
Date: {date}
Reference No: {ref_no} or {ref.no}

Subject: Relieving Letter

This is to certify that {employee_name}, who was working 
as {employee_designation} from {employment_start_date}, 
has submitted his/her resignation on {resignation_date} 
and is being relieved from our services on {relieving_date}.

{signatory_name}
{signatory_designation}
```

---

## Placeholder Format Support

The system supports **both** formats:
- Single braces: `{placeholder_name}`
- Double braces: `{{placeholder_name}}`

Both formats will work in your DOCX templates.

---

## Date Format

All date placeholders are automatically formatted as: **"DD Month YYYY"** (e.g., "15 November 2024")

Examples:
- `{date}` → "24 November 2024"
- `{start_date}` → "01 January 2024"
- `{joining_date}` → "15 March 2024"

---

## Reference Number (`{ref.no}`)

The `{ref.no}` placeholder is **automatically generated** based on:
- The **Reference Period** (Month & Year) you select
- The format is typically: **"REF-YYYY-MM-NNN"** (where NNN is a sequence number)

**Important**: Always select a Reference Period when generating documents, as `{ref.no}` is required.

---

## Notes for Template Creation

1. **All placeholders are case-sensitive** - Use exact spelling as shown
2. **Required vs Optional** - Check the table above for which fields are mandatory
3. **Empty values** - Optional placeholders will be empty strings if not provided
4. **Date formatting** - All dates are automatically formatted in readable format
5. **Name formatting** - Names are automatically capitalized (proper case)
6. **Multiple formats** - You can use both `{name}` and `{{name}}` formats

---

## Quick Reference Summary

### Common to All Documents:
- `{ref.no}` - Auto-generated reference number
- `{date}` or `{letter_date}` - Letter date
- `{name}` or specific name placeholder - Person's name
- `{signatory_name}` - Signatory name (if applicable)

### Document-Specific:
- **Offer Letter**: `{employee_name}`, `{job_title}`, `{joining_date}`, `{address}`
- **Internship Letter**: `{intern_name}`, `{intern_role}`, `{internship_duration}`, `{work_area_1}`, `{work_area_2}`, `{signatory_designation}`
- **Experience Letter**: `{role}`, `{start_date}`, `{end_date}`, `{phone_number}`
- **Relieving Letter**: `{employee_designation}`, `{resignation_date}`, `{relieving_date}`, `{employment_start_date}`, `{signatory_designation}`

