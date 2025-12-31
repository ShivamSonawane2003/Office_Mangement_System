import React, { useState, useEffect } from 'react';
import './Documents.css';
import AutoSizeText from './utils/AutoSizeText';
import PDFViewer from './PDFViewer';

const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.4:8002';
const API_BASE = RAW_API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

function RelievingLetter({ showToast }) {
  const [templateFile, setTemplateFile] = useState(null);
  const [formData, setFormData] = useState({
    date: '',
    refNo: '',
    employeeName: '',
    resignationDate: '',
    relievingDate: '',
    employmentStartDate: '',
    employeeDesignation: '',
    signatoryName: '',
    signatoryDesignation: '',
    refPeriod: '',
  });
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewZoom, setPreviewZoom] = useState(1);

  useEffect(() => () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [downloadUrl, previewUrl]);

  const revokePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl('');
  };

  const handleClosePreviewModal = () => {
    revokePreview();
    setPreviewError('');
    setPreviewLoading(false);
    setPreviewZoom(1);
    setShowPreviewModal(false);
  };

  const notify = (message, type = 'info') => {
    if (typeof showToast === 'function') {
      showToast({
        message,
        type,
        duration: 3500,
      });
    }
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setTemplateFile(null);
      setFileError('');
      return;
    }

    const fileName = (file.name || '').toLowerCase();
    const hasValidExtension = fileName.endsWith('.docx');
    const hasValidMimeType =
      !file.type || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (!hasValidExtension && !hasValidMimeType) {
      setTemplateFile(null);
      setFileError('Only DOCX template files are supported.');
      notify('Only DOCX template files are supported.', 'error');
      event.target.value = '';
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setTemplateFile(null);
      setFileError('File size must be less than 10MB.');
      notify('File size must be less than 10MB.', 'error');
      event.target.value = '';
      return;
    }

    setFileError('');
    setTemplateFile(file);
    notify('Template file selected successfully.', 'success');
  };

  const triggerDownload = (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relieving_letter.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const validateForm = () => {
    const requiredFields = [
      'date',
      'refNo',
      'employeeName',
      'resignationDate',
      'relievingDate',
      'employmentStartDate',
      'employeeDesignation',
      'signatoryName',
      'signatoryDesignation',
    ];

    for (const field of requiredFields) {
      if (!formData[field] || !formData[field].toString().trim()) {
        notify('All placeholder fields are required.', 'error');
        return false;
      }
    }

    if (!formData.refPeriod) {
      notify('Reference period (month & year) is required for the reference number.', 'error');
      return false;
    }

    const refParts = formData.refPeriod.split('-');
    const refYearNumber = Number(refParts[0]);
    const refMonthNumber = Number(refParts[1]);
    if (
      refParts.length !== 2 ||
      Number.isNaN(refYearNumber) ||
      refYearNumber < 1900 ||
      refYearNumber > 9999 ||
      Number.isNaN(refMonthNumber) ||
      refMonthNumber < 1 ||
      refMonthNumber > 12
    ) {
      notify('Please enter a valid reference period (YYYY-MM).', 'error');
      return false;
    }

    if (!templateFile) {
      setFileError('Please upload a DOCX template file.');
      notify('Template file (DOCX) is required. Please upload a template file.', 'error');
      return false;
    }

    if (new Date(formData.relievingDate) < new Date(formData.employmentStartDate)) {
      notify('Relieving date must be after employment start date.', 'error');
      return false;
    }

    if (new Date(formData.relievingDate) < new Date(formData.resignationDate)) {
      notify('Relieving date must be after resignation date.', 'error');
      return false;
    }

    return true;
  };

  const handleGenerate = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      notify('Session expired. Please login again.', 'error');
      return;
    }

    setIsGenerating(true);
    setDownloadUrl('');
    setFileError('');

    try {
      const payload = new FormData();
      payload.append('template_file', templateFile);

      const trimmedEmployeeName = formData.employeeName.trim();
      const trimmedDesignation = formData.employeeDesignation.trim();
      const trimmedSignatoryName = formData.signatoryName.trim();
      const trimmedSignatoryDesignation = formData.signatoryDesignation.trim();

      payload.append('name', trimmedEmployeeName);
      payload.append('role', trimmedDesignation);
      payload.append('start_date', formData.employmentStartDate);
      payload.append('end_date', formData.relievingDate);
      payload.append('address', '');
      payload.append('phone', '');
      payload.append('signatory_name', trimmedSignatoryName);
      payload.append('letter_date', formData.date);

      // Reference number inputs (required)
      const refParts = formData.refPeriod.split('-');
      const refYearNumber = Number(refParts[0]);
      const refMonthNumber = Number(refParts[1]);
      payload.append('ref_month', String(refMonthNumber));
      payload.append('ref_year', String(refYearNumber));

      const placeholderValues = {
        date: formData.date,
        ref_no: formData.refNo.trim(),
        employee_name: trimmedEmployeeName,
        resignation_date: formData.resignationDate,
        relieving_date: formData.relievingDate,
        employment_start_date: formData.employmentStartDate,
        employee_designation: trimmedDesignation,
        signatory_name: trimmedSignatoryName,
        signatory_designation: trimmedSignatoryDesignation,
      };
      payload.append('placeholder_values', JSON.stringify(placeholderValues));
      payload.append('signatory_designation', trimmedSignatoryDesignation);

      const response = await fetch(`${API_PREFIX}/documents/experience-letter/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        let errorMessage = 'Unable to generate relieving letter.';
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          if (data && data.detail) {
            errorMessage = data.detail;
          } else if (data && data.message) {
            errorMessage = data.message;
          }
        } catch (err) {
          try {
            const clonedResponse = response.clone();
            const text = await clonedResponse.text();
            if (text) {
              errorMessage = text.substring(0, 200);
            }
          } catch (textErr) {
            // ignore
          }
        }

        console.error('Relieving letter generation failed:', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          error: errorMessage,
        });

        throw new Error(errorMessage);
      }

      if (!contentType.includes('application/pdf')) {
        throw new Error('Server returned non-PDF response. Please try again.');
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Generated PDF is empty. Please check your input and try again.');
      }

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      triggerDownload(url);
      notify('Relieving letter generated successfully! Download started.', 'success');
    } catch (error) {
      console.error('Error generating relieving letter:', error);
      const errorMessage = error.message || 'Failed to generate relieving letter. Please try again.';
      notify(errorMessage, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAgain = () => {
    if (downloadUrl) {
      triggerDownload(downloadUrl);
      notify('Downloading PDF again...', 'info');
    }
  };

  const handlePreview = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      notify('Session expired. Please login again.', 'error');
      return;
    }

    setIsGenerating(true);
    setFileError('');

    try {
      const payload = new FormData();
      payload.append('template_file', templateFile);

      const trimmedEmployeeName = formData.employeeName.trim();
      const trimmedDesignation = formData.employeeDesignation.trim();
      const trimmedSignatoryName = formData.signatoryName.trim();
      const trimmedSignatoryDesignation = formData.signatoryDesignation.trim();

      payload.append('name', trimmedEmployeeName);
      payload.append('role', trimmedDesignation);
      payload.append('start_date', formData.employmentStartDate);
      payload.append('end_date', formData.relievingDate);
      payload.append('address', '');
      payload.append('phone', '');
      payload.append('signatory_name', trimmedSignatoryName);
      payload.append('letter_date', formData.date);

      const refParts = formData.refPeriod.split('-');
      const refYearNumber = Number(refParts[0]);
      const refMonthNumber = Number(refParts[1]);
      payload.append('ref_month', String(refMonthNumber));
      payload.append('ref_year', String(refYearNumber));

      const placeholderValues = {
        date: formData.date,
        ref_no: formData.refNo.trim(),
        employee_name: trimmedEmployeeName,
        resignation_date: formData.resignationDate,
        relieving_date: formData.relievingDate,
        employment_start_date: formData.employmentStartDate,
        employee_designation: trimmedDesignation,
        signatory_name: trimmedSignatoryName,
        signatory_designation: trimmedSignatoryDesignation,
      };
      payload.append('placeholder_values', JSON.stringify(placeholderValues));
      payload.append('signatory_designation', trimmedSignatoryDesignation);

      const response = await fetch(`${API_PREFIX}/documents/experience-letter/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        let errorMessage = 'Unable to generate relieving letter.';
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          if (data && data.detail) {
            errorMessage = data.detail;
          } else if (data && data.message) {
            errorMessage = data.message;
          }
        } catch (err) {
          try {
            const clonedResponse = response.clone();
            const text = await clonedResponse.text();
            if (text) {
              errorMessage = text.substring(0, 200);
            }
          } catch (textErr) {
            // ignore
          }
        }
        throw new Error(errorMessage);
      }

      if (!contentType.includes('application/pdf')) {
        throw new Error('Server returned non-PDF response. Please try again.');
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Generated PDF is empty. Please check your input and try again.');
      }

      // Show PDF in modal preview
      revokePreview();
      setShowPreviewModal(true);
      setPreviewError('');
      setPreviewLoading(true);
      setPreviewZoom(1);
      
      // Create blob URL - ensure it's properly created
      try {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        notify('PDF preview ready.', 'success');
      } catch (error) {
        console.error('Error creating preview URL:', error);
        setPreviewError('Failed to create PDF preview. Please try downloading instead.');
        setPreviewLoading(false);
      }
    } catch (error) {
      console.error('Error generating PDF preview:', error);
      const errorMessage = error.message || 'Failed to generate PDF preview. Please try again.';
      notify(errorMessage, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="documents-section">
      <div className="documents-card">
        <div className="documents-header">
          <AutoSizeText as="h3" className="documents-title" min={18} max={28}>
            Relieving Letter Generator
          </AutoSizeText>
          <AutoSizeText as="p" className="documents-subtitle" min={12} max={18}>
            Upload a DOCX template file containing placeholders like {`{date}`}, {`{ref_no}`}, {`{employee_name}`},
            {`{resignation_date}`}, {`{relieving_date}`}, {`{employment_start_date}`}, {`{employee_designation}`},
            {`{signatory_name}`}, {`{signatory_designation}`}, or {`{ref.no}`}. Fill out every field to generate a personalized
            relieving letter PDF.
          </AutoSizeText>
        </div>

        <form className="documents-form" onSubmit={handleGenerate}>
          <div className="documents-field">
            <AutoSizeText as="label" htmlFor="template" min={12} max={16}>
              DOCX Template File <span style={{ color: '#e74c3c' }}>*</span>
            </AutoSizeText>
            <input id="template" type="file" accept=".docx" onChange={handleFileChange} required />
            {fileError && (
              <AutoSizeText as="p" className="documents-error" min={11} max={14}>
                {fileError}
              </AutoSizeText>
            )}
            {templateFile && (
              <AutoSizeText as="p" className="documents-hint" min={10} max={13} style={{ color: '#27ae60' }}>
                ✓ Template selected: {templateFile.name}
              </AutoSizeText>
            )}
            {!templateFile && (
              <AutoSizeText as="p" className="documents-hint" min={10} max={13}>
                Please upload a DOCX template file with the placeholders listed above.
              </AutoSizeText>
            )}
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="date" min={12} max={16}>
                Date <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input id="date" name="date" type="date" value={formData.date} onChange={handleFieldChange} required />
            </div>
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="employeeName" min={12} max={16}>
                Employee Name <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="employeeName"
                name="employeeName"
                type="text"
                value={formData.employeeName}
                onChange={handleFieldChange}
                placeholder="e.g. Priya Sharma"
                required
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="employeeDesignation" min={12} max={16}>
                Employee Designation <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="employeeDesignation"
                name="employeeDesignation"
                type="text"
                value={formData.employeeDesignation}
                onChange={handleFieldChange}
                placeholder="e.g. Senior Developer"
                required
              />
            </div>
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="employmentStartDate" min={12} max={16}>
                Employee Joining Date <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="employmentStartDate"
                name="employmentStartDate"
                type="date"
                value={formData.employmentStartDate}
                onChange={handleFieldChange}
                required
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="resignationDate" min={12} max={16}>
              Employee Resignation Date <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="resignationDate"
                name="resignationDate"
                type="date"
                value={formData.resignationDate}
                onChange={handleFieldChange}
                required
              />
            </div>
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="relievingDate" min={12} max={16}>
                Relieving Date <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="relievingDate"
                name="relievingDate"
                type="date"
                value={formData.relievingDate}
                onChange={handleFieldChange}
                required
              />
            </div>
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="refPeriod" min={12} max={16}>
                Reference Period (for {`{ref.no}`}) <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="refPeriod"
                name="refPeriod"
                type="month"
                value={formData.refPeriod}
                onChange={handleFieldChange}
                placeholder="e.g. January, 2024"
                required
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="signatoryName" min={12} max={16}>
                Signatory Name <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="signatoryName"
                name="signatoryName"
                type="text"
                value={formData.signatoryName}
                onChange={handleFieldChange}
                placeholder="Name of authorized signatory"
                required
              />
            </div>
          </div>

          <div className="documents-field">
            <AutoSizeText as="label" htmlFor="signatoryDesignation" min={12} max={16}>
              Signatory Designation <span style={{ color: '#e74c3c' }}>*</span>
            </AutoSizeText>
            <input
              id="signatoryDesignation"
              name="signatoryDesignation"
              type="text"
              value={formData.signatoryDesignation}
              onChange={handleFieldChange}
              placeholder="e.g. HR Manager"
              required
            />
          </div>

          <div className="documents-actions">
            <button type="submit" className="documents-primary" disabled={isGenerating}>
              <AutoSizeText as="span" min={12} max={18}>
                {isGenerating ? 'Generating PDF…' : 'Generate & Download PDF'}
              </AutoSizeText>
            </button>
            <button
              type="button"
              className="documents-secondary"
              onClick={handlePreview}
              disabled={isGenerating}
            >
              <AutoSizeText as="span" min={12} max={16}>
                Generate PDF Preview
              </AutoSizeText>
            </button>
            <button
              type="button"
              className="documents-secondary"
              onClick={handleDownloadAgain}
              disabled={!downloadUrl}
            >
              <AutoSizeText as="span" min={12} max={16}>
                Download PDF Again
              </AutoSizeText>
            </button>
          </div>
        </form>
      </div>

      {showPreviewModal && (
        <div className="modal-overlay" onClick={handleClosePreviewModal}>
          <div className="modal-content bill-preview" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>PDF Preview</h2>
              <div className="bill-preview-controls">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewZoom(1);
                  }}
                  className="bill-preview-zoom-btn"
                  disabled={previewLoading}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.max(0.25, Number((prev - 0.25).toFixed(2))))}
                  className="bill-preview-zoom-btn"
                  disabled={previewLoading}
                >
                  −
                </button>
                <span className="bill-preview-zoom-label">{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
                  className="bill-preview-zoom-btn"
                  disabled={previewLoading}
                >
                  +
                </button>
              </div>
              <button className="modal-close" onClick={handleClosePreviewModal}>&times;</button>
            </div>
            <div className="modal-body bill-preview-body">
              {previewError && (
                <p className="bill-preview-error">{previewError}</p>
              )}
              {!previewError && previewUrl && (
                <div className="bill-preview-frame" style={{ width: '100%', height: '100%' }}>
                  <PDFViewer 
                    url={previewUrl} 
                    zoom={previewZoom}
                    onLoad={() => setPreviewLoading(false)}
                  />
                </div>
              )}
              {!previewUrl && !previewError && (
                <div className="bill-preview-loading">Preparing PDF preview…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default RelievingLetter;

