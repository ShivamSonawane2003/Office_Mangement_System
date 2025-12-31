import React, { useState, useEffect } from 'react';
import './Documents.css';
import AutoSizeText from './utils/AutoSizeText';
import PDFViewer from './PDFViewer';

const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.4:8002';
const API_BASE = RAW_API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

function Documents({ showToast }) {
  const [templateFile, setTemplateFile] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    startDate: '',
    endDate: '',
    address: '',
    phone: '',
    signatoryName: '',
    letterDate: '',
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

    // Check file extension - only DOCX is supported
    const fileName = (file.name || '').toLowerCase();
    const hasValidExtension = fileName.endsWith('.docx');
    
    // Check MIME type
    const hasValidMimeType = !file.type || 
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (!hasValidExtension && !hasValidMimeType) {
      setTemplateFile(null);
      setFileError('Only DOCX template files are supported.');
      notify('Only DOCX template files are supported.', 'error');
      event.target.value = '';
      return;
    }

    // Additional size check (limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
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
    link.download = 'experience_letter.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerate = async (event) => {
    event.preventDefault();

    // Validate required fields
    const trimmedName = formData.name.trim();
    const trimmedRole = formData.role.trim();
    
    if (!trimmedName || !trimmedRole || !formData.startDate || !formData.endDate) {
      notify('Name, Role, Start Date, and End Date are required.', 'error');
      return;
    }

    // Template file is required
    if (!templateFile) {
      setFileError('Please upload a DOCX template file.');
      notify('Template file (DOCX) is required. Please upload a template file.', 'error');
      return;
    }

    // Reference month/year are required for {ref.no}
    if (!formData.refPeriod) {
      notify('Reference period (month & year) is required for the reference number.', 'error');
      return;
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
      return;
    }
    
    // Validate date format (should be YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(formData.startDate) || !dateRegex.test(formData.endDate)) {
      notify('Please select valid dates in the correct format.', 'error');
      return;
    }
    
    // Validate that end date is after start date
    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      notify('End date must be after start date.', 'error');
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
      
      // Template file is required
      payload.append('template_file', templateFile);
      
      // Required fields
      payload.append('name', trimmedName);
      payload.append('role', trimmedRole);
      payload.append('start_date', formData.startDate);
      payload.append('end_date', formData.endDate);
      
      // Optional fields - send empty string if not provided (backend expects this)
      payload.append('address', formData.address ? formData.address.trim() : '');
      payload.append('phone', formData.phone ? formData.phone.trim() : '');
      payload.append('signatory_name', formData.signatoryName ? formData.signatoryName.trim() : '');
      
      // Letter date - only send if provided, otherwise backend uses current date
      if (formData.letterDate) {
        payload.append('letter_date', formData.letterDate);
      }

      // Reference number inputs (required)
      const refParts = formData.refPeriod.split('-');
      const refYearNumber = Number(refParts[0]);
      const refMonthNumber = Number(refParts[1]);
      payload.append('ref_month', String(refMonthNumber));
      payload.append('ref_year', String(refYearNumber));

      const response = await fetch(`${API_PREFIX}/documents/experience-letter/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      // Check content type first (before consuming response)
      const contentType = response.headers.get('content-type') || '';
      
      if (!response.ok) {
        let errorMessage = 'Unable to generate experience letter.';
        try {
          // Clone response to read error without consuming the original
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          if (data && data.detail) {
            errorMessage = data.detail;
          } else if (data && data.message) {
            errorMessage = data.message;
          }
        } catch (err) {
          // If response is not JSON, try to get text
          try {
            const clonedResponse = response.clone();
            const text = await clonedResponse.text();
            if (text) {
              errorMessage = text.substring(0, 200); // Limit error message length
            }
          } catch (textErr) {
            // ignore text parsing errors
          }
        }
        
        // Log error for debugging
        console.error('Experience letter generation failed:', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          error: errorMessage
        });
        
        throw new Error(errorMessage);
      }

      // Verify response is PDF
      if (!contentType.includes('application/pdf')) {
        throw new Error('Server returned non-PDF response. Please try again.');
      }

      const blob = await response.blob();
      
      // Verify blob is not empty
      if (blob.size === 0) {
        throw new Error('Generated PDF is empty. Please check your input and try again.');
      }
      
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      triggerDownload(url);
      notify('Experience letter generated successfully! Download started.', 'success');
    } catch (error) {
      console.error('Error generating experience letter:', error);
      const errorMessage = error.message || 'Failed to generate experience letter. Please try again.';
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

    // Validate required fields (same as handleGenerate)
    const trimmedName = formData.name.trim();
    const trimmedRole = formData.role.trim();
    
    if (!trimmedName || !trimmedRole || !formData.startDate || !formData.endDate) {
      notify('Name, Role, Start Date, and End Date are required.', 'error');
      return;
    }

    if (!templateFile) {
      setFileError('Please upload a DOCX template file.');
      notify('Template file (DOCX) is required. Please upload a template file.', 'error');
      return;
    }

    if (!formData.refPeriod) {
      notify('Reference period (month & year) is required for the reference number.', 'error');
      return;
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
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(formData.startDate) || !dateRegex.test(formData.endDate)) {
      notify('Please select valid dates in the correct format.', 'error');
      return;
    }
    
    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      notify('End date must be after start date.', 'error');
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
      payload.append('name', trimmedName);
      payload.append('role', trimmedRole);
      payload.append('start_date', formData.startDate);
      payload.append('end_date', formData.endDate);
      payload.append('address', formData.address ? formData.address.trim() : '');
      payload.append('phone', formData.phone ? formData.phone.trim() : '');
      payload.append('signatory_name', formData.signatoryName ? formData.signatoryName.trim() : '');
      
      if (formData.letterDate) {
        payload.append('letter_date', formData.letterDate);
      }

      const refParts = formData.refPeriod.split('-');
      const refYearNumber = Number(refParts[0]);
      const refMonthNumber = Number(refParts[1]);
      payload.append('ref_month', String(refMonthNumber));
      payload.append('ref_year', String(refYearNumber));

      const response = await fetch(`${API_PREFIX}/documents/experience-letter/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      const contentType = response.headers.get('content-type') || '';
      
      if (!response.ok) {
        let errorMessage = 'Unable to generate experience letter.';
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
            // ignore text parsing errors
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
            Experience Letter Generator
          </AutoSizeText>
          <AutoSizeText as="p" className="documents-subtitle" min={12} max={18}>
            Upload a DOCX template file with placeholders and generate a personalized PDF experience letter.
            Use placeholders like {`{name}`}, {`{role}`}, {`{start_date}`}, {`{end_date}`}, {`{letter_date}`}, {`{address}`}, {`{phone_number}`}, or {`{ref.no}`} in your template.
          </AutoSizeText>
        </div>

        <form className="documents-form" onSubmit={handleGenerate}>
          <div className="documents-field">
            <AutoSizeText as="label" htmlFor="template" min={12} max={16}>
              DOCX Template File <span style={{ color: '#e74c3c' }}>*</span>
            </AutoSizeText>
            <input
              id="template"
              type="file"
              accept=".docx"
              onChange={handleFileChange}
              required
            />
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
                Please upload a DOCX template file with placeholders (e.g., {`{name}`}, {`{role}`}, {`{start_date}`}, etc.)
              </AutoSizeText>
            )}
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="name" min={12} max={16}>
                Candidate Name <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleFieldChange}
                placeholder="e.g. Priya Sharma"
                required
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="role" min={12} max={16}>
                Role / Position <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="role"
                name="role"
                type="text"
                value={formData.role}
                onChange={handleFieldChange}
                placeholder="e.g. Senior Developer"
                required
              />
            </div>
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="startDate" min={12} max={16}>
              Employee Joining Date<span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="startDate"
                name="startDate"
                type="date"
                value={formData.startDate}
                onChange={handleFieldChange}
                required
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="endDate" min={12} max={16}>
              Employee Resignation Date <span style={{ color: '#e74c3c' }}>*</span>
              </AutoSizeText>
              <input
                id="endDate"
                name="endDate"
                type="date"
                value={formData.endDate}
                onChange={handleFieldChange}
                required
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="letterDate" min={12} max={16}>
                Letter Date (Optional)
              </AutoSizeText>
              <input
                id="letterDate"
                name="letterDate"
                type="date"
                value={formData.letterDate}
                onChange={handleFieldChange}
              />
            </div>
          </div>

          <div className="documents-grid">
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="address" min={12} max={16}>
                Address (Optional)
              </AutoSizeText>
              <input
                id="address"
                name="address"
                type="text"
                value={formData.address}
                onChange={handleFieldChange}
                placeholder="Residential address"
              />
            </div>
            <div className="documents-field">
              <AutoSizeText as="label" htmlFor="phone" min={12} max={16}>
                Phone Number (Optional)
              </AutoSizeText>
              <input
                id="phone"
                name="phone"
                type="text"
                value={formData.phone}
                onChange={handleFieldChange}
                placeholder="Phone number"
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
                Signatory Name (Optional)
              </AutoSizeText>
              <input
                id="signatoryName"
                name="signatoryName"
                type="text"
                value={formData.signatoryName}
                onChange={handleFieldChange}
                placeholder="Name of person signing the letter"
              />
            </div>
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
                    onLoad={() => {
                      setPreviewLoading(false);
                    }}
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

export default Documents;
