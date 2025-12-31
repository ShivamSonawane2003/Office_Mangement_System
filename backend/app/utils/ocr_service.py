import pytesseract
from PIL import Image
import re
import io
from typing import Optional
import logging

logger = logging.getLogger(__name__)

def extract_gst_rate_from_image(image_bytes: bytes) -> Optional[float]:
    """
    Extract GST rate from bill image using OCR.
    Looks for patterns like 'GST @ 18%', 'GST 18%', '18% GST', etc.
    """
    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_bytes))
        
        # Perform OCR
        text = pytesseract.image_to_string(image)
        logger.info(f"OCR extracted text: {text}...")  # Log first 200 chars
        
        # Look for GST rate patterns
        # Pattern 1: GST @ 18%, GST 18%, 18% GST
        gst_patterns = [
            r'GST\s*[@]?\s*(\d+(?:\.\d+)?)\s*%',
            r'(\d+(?:\.\d+)?)\s*%\s*GST',
            r'GST\s*RATE\s*[:]?\s*(\d+(?:\.\d+)?)\s*%',
            r'GST\s*(\d+(?:\.\d+)?)\s*%',
        ]
        
        for pattern in gst_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                rate = float(matches[0])
                # Validate GST rate (should be between 0 and 100, common rates are 0, 5, 12, 18, 28)
                if 0 <= rate <= 100:
                    logger.info(f"Found GST rate: {rate}%")
                    return rate
        
        # Pattern 2: Look for common GST rates in the text
        common_rates = [28, 18, 12, 5, 0]
        for rate in common_rates:
            # Look for rate followed by % near GST keyword
            pattern = rf'GST.*?{rate}\s*%|{rate}\s*%.*?GST'
            if re.search(pattern, text, re.IGNORECASE):
                logger.info(f"Found common GST rate: {rate}%")
                return float(rate)
        
        logger.warning("Could not extract GST rate from image, using default 18%")
        return None
        
    except Exception as e:
        logger.error(f"Error in OCR processing: {e}", exc_info=True)
        return None

def extract_amount_from_image(image_bytes: bytes) -> Optional[float]:
    """
    Extract total amount from bill image using OCR.
    Looks for patterns like 'Total: ₹1000', 'Amount: 1000', etc.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(image)
        
        # Look for amount patterns
        amount_patterns = [
            r'Total\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            r'Amount\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            r'Grand\s*Total\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            r'[₹]\s*(\d+(?:[.,]\d+)?)',
        ]
        
        for pattern in amount_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                amount_str = matches[-1].replace(',', '')
                try:
                    amount = float(amount_str)
                    logger.info(f"Found amount: ₹{amount}")
                    return amount
                except ValueError:
                    continue
        
        return None
        
    except Exception as e:
        logger.error(f"Error extracting amount from image: {e}", exc_info=True)
        return None

def extract_gst_amount_from_image(image_bytes: bytes) -> Optional[float]:
    """
    Extract ONLY GST/Tax amount from bill image using OCR.
    Strictly looks for GST/tax-specific patterns and ignores other amounts like Total, Subtotal, etc.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        # Improve OCR accuracy by preprocessing the image
        # Convert to grayscale for better OCR
        if image.mode != 'L':
            image = image.convert('L')
        
        # Enhance image for better OCR - increase contrast and sharpen
        from PIL import ImageEnhance, ImageFilter
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)  # Increase contrast
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(2.0)  # Sharpen image
        
        # Resize if image is too small (better OCR on larger images)
        width, height = image.size
        if width < 800 or height < 800:
            scale = max(800 / width, 800 / height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Use better OCR config - focus on numbers and common GST keywords
        # PSM 6 = Assume a single uniform block of text
        custom_config = r'--oem 3 --psm 6'
        text = pytesseract.image_to_string(image, config=custom_config)
        logger.info(f"OCR extracted text for GST amount (first 1000 chars): {text[:1000]}")
        
        # Split text into lines for better context matching
        lines = text.split('\n')
        
        # Look for GST/tax-specific patterns - prioritize explicit GST/tax keywords
        # Pattern 1: Total GST (most common - "Total GST: ₹180" or "GST Total: ₹180")
        # Made more flexible to handle OCR errors (missing spaces, different formats)
        total_gst_patterns = [
            r'Total\s+GST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "Total GST: ₹180"
            r'GST\s+Total\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',   # "GST Total: ₹180"
            r'Total\s+Tax\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',   # "Total Tax: ₹180"
            r'Total\s*GST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',   # "TotalGST: ₹180" (no space)
            r'GST\s*Total\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',   # "GSTTotal: ₹180" (no space)
            r'GST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)\s*Total',   # "GST: ₹180 Total" (reversed)
        ]
        
        for pattern in total_gst_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                amount_str = matches[-1].replace(',', '')  # Remove thousand separators, keep decimal point
                try:
                    gst_amount = float(amount_str)
                    logger.info(f"Found Total GST/Tax amount from OCR: ₹{gst_amount}")
                    return gst_amount
                except ValueError:
                    continue
        
        # Pattern 2: CGST + SGST (combined or separate)
        cgst_sgst_combined = re.search(
            r'CGST\s*[+]?\s*SGST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            text, re.IGNORECASE
        )
        if cgst_sgst_combined:
            try:
                amount_str = cgst_sgst_combined.group(1).replace(',', '')  # Remove thousand separators
                gst_amount = float(amount_str)
                logger.info(f"Found CGST+SGST combined: ₹{gst_amount}")
                return gst_amount
            except ValueError:
                pass
        
        # Pattern 3: Find CGST and SGST separately and add them (only if both found)
        # Handle multiple formats:
        # 1. "CGST (6%) 12.00" - with percentage in parentheses
        # 2. "CGST ' 420" or "CGST H 420" - without percentage, just amount after
        # Use line-by-line search to find CGST and SGST on separate lines
        cgst_amount = None
        sgst_amount = None
        
        logger.info(f"Searching for CGST/SGST in {len(lines)} lines...")
        
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Skip empty lines
            if not line_stripped:
                continue
            
            # Pattern 1: CGST with percentage and amount: "CGST (6%) 12.00"
            cgst_match = re.search(r'CGST\s*\([^)]+\)\s+(\d+(?:[.,]\d+)?)', line_stripped, re.IGNORECASE)
            if cgst_match:
                try:
                    cgst_str = cgst_match.group(1).replace(',', '')
                    cgst_val = float(cgst_str)
                    # Validate it's not a percentage (percentages are 0-100, amounts are usually > 1)
                    if cgst_val > 1.0:  # GST amounts are usually > ₹1
                        cgst_amount = cgst_val
                        logger.info(f"Found CGST amount: ₹{cgst_amount} from line {i}: {line_stripped[:60]}")
                except ValueError:
                    pass
            
            # Pattern 2: CGST without percentage: "CGST ' 420" or "CGST H 420" or "CGST: 420"
            if cgst_amount is None:
                # Look for CGST followed by any characters (including quotes, letters, etc.) and then a number
                # Use \s+ to require at least one space, then [^\d]* to match any non-digits, then capture the number
                cgst_match2 = re.search(r'CGST\s+[^\d]*(\d+(?:[.,]\d+)?)', line_stripped, re.IGNORECASE)
                if cgst_match2:
                    try:
                        cgst_str = cgst_match2.group(1).replace(',', '')
                        cgst_val = float(cgst_str)
                        # Validate it's not a percentage and is a reasonable amount
                        if 1.0 < cgst_val < 1000000:  # GST amounts are usually > ₹1
                            cgst_amount = cgst_val
                            logger.info(f"Found CGST amount (no percentage): ₹{cgst_amount} from line {i}: {line_stripped[:60]}")
                    except ValueError:
                        pass
            
            # Pattern 1: SGST with percentage and amount: "SGST (6%) 12.00"
            sgst_match = re.search(r'SGST\s*\([^)]+\)\s+(\d+(?:[.,]\d+)?)', line_stripped, re.IGNORECASE)
            if sgst_match:
                try:
                    sgst_str = sgst_match.group(1).replace(',', '')
                    sgst_val = float(sgst_str)
                    # Validate it's not a percentage
                    if sgst_val > 1.0:  # GST amounts are usually > ₹1
                        sgst_amount = sgst_val
                        logger.info(f"Found SGST amount: ₹{sgst_amount} from line {i}: {line_stripped[:60]}")
                except ValueError:
                    pass
            
            # Pattern 2: SGST without percentage: "SGST ' 420" or "SGST H 420" or "SGST: 420"
            if sgst_amount is None:
                # Look for SGST followed by any characters (including quotes, letters, etc.) and then a number
                sgst_match2 = re.search(r'SGST\s+[^\d]*(\d+(?:[.,]\d+)?)', line_stripped, re.IGNORECASE)
                if sgst_match2:
                    try:
                        sgst_str = sgst_match2.group(1).replace(',', '')
                        sgst_val = float(sgst_str)
                        # Validate it's not a percentage and is a reasonable amount
                        if 1.0 < sgst_val < 1000000:  # GST amounts are usually > ₹1
                            sgst_amount = sgst_val
                            logger.info(f"Found SGST amount (no percentage): ₹{sgst_amount} from line {i}: {line_stripped[:60]}")
                    except ValueError:
                        pass
        
        # If both found, return their sum
        if cgst_amount is not None and sgst_amount is not None:
            total_gst = cgst_amount + sgst_amount
            logger.info(f"Found CGST: ₹{cgst_amount}, SGST: ₹{sgst_amount}, Total GST: ₹{total_gst}")
            return total_gst
        elif cgst_amount is not None:
            # Only CGST found (unusual but possible)
            logger.info(f"Found only CGST: ₹{cgst_amount}")
            return cgst_amount
        elif sgst_amount is not None:
            # Only SGST found (unusual but possible)
            logger.info(f"Found only SGST: ₹{sgst_amount}")
            return sgst_amount
        else:
            logger.info("CGST/SGST pattern did not find any matches")
        
        # Pattern 4: IGST (Interstate GST) - made more flexible for OCR errors
        # Handle common OCR errors: IGST might be read as IGST, I6ST, IG5T, etc.
        igst_patterns = [
            r'IGST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # Standard "IGST: ₹684.90"
            r'I[G6]ST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # OCR error: I6ST or IG5T
            r'IG[5S]T\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # OCR error: IG5T
            r'Total\s+IGST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "Total IGST: ₹684.90"
            r'IGST\s+Amount\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "IGST Amount: ₹684.90"
            r'Add\s*[:]?\s*IGST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "Add: IGST: ₹684.90"
            r'Total\s+Tax\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "Total Tax: ₹684.90" (if IGST is the only tax)
        ]
        
        for pattern in igst_patterns:
            igst_match = re.search(pattern, text, re.IGNORECASE)
            if igst_match:
                try:
                    amount_str = igst_match.group(1).replace(',', '')  # Remove thousand separators
                    gst_amount = float(amount_str)
                    logger.info(f"Found IGST amount: ₹{gst_amount}")
                    return gst_amount
                except ValueError:
                    continue
        
        # Pattern 5: GST Amount (explicit label) - made more flexible
        gst_amount_patterns = [
            r'GST\s+Amount\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "GST Amount: ₹180"
            r'GST\s*Amount\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',  # "GSTAmount: ₹180" (no space)
            r'GST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)\s*Amount',  # "GST: ₹180 Amount" (reversed)
            r'GST\s*[:]?\s*(\d+(?:[.,]\d+)?)',  # Simple "GST: 180" or "GST 180"
        ]
        
        for pattern in gst_amount_patterns:
            gst_amount_label = re.search(pattern, text, re.IGNORECASE)
            if gst_amount_label:
                try:
                    amount_str = gst_amount_label.group(1).replace(',', '')  # Remove thousand separators
                    gst_amount = float(amount_str)
                    logger.info(f"Found GST Amount: ₹{gst_amount}")
                    return gst_amount
                except ValueError:
                    continue
        
        # Pattern 6: Tax Amount (if explicitly labeled as tax)
        tax_amount_label = re.search(
            r'Tax\s+Amount\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            text, re.IGNORECASE
        )
        if tax_amount_label:
            try:
                amount_str = tax_amount_label.group(1).replace(',', '')  # Remove thousand separators
                tax_amount = float(amount_str)
                logger.info(f"Found Tax Amount: ₹{tax_amount}")
                return tax_amount
            except ValueError:
                pass
        
        # Pattern 7: VAT (Value Added Tax) - if present
        vat_match = re.search(
            r'VAT\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            text, re.IGNORECASE
        )
        if vat_match:
            try:
                amount_str = vat_match.group(1).replace(',', '')  # Remove thousand separators
                vat_amount = float(amount_str)
                logger.info(f"Found VAT amount: ₹{vat_amount}")
                return vat_amount
            except ValueError:
                pass
        
        # Pattern 8: Look for GST/IGST/CGST/SGST in table format (common in bills)
        # Pattern: "GST" followed by amount on same line or next line
        for i, line in enumerate(lines):
            line_lower = line.lower().strip()
            # Skip lines with Total, Subtotal, Grand Total, etc. to avoid confusion
            # But allow "Total IGST" or "Total GST" as those are valid
            if any(word in line_lower for word in ['subtotal', 'grand', 'sum', 'net', 'balance']):
                continue
            
            # Check if line contains GST/IGST/CGST/SGST keyword (handle OCR errors)
            # Look for variations: gst, igst, cgst, sgst, or common OCR errors
            tax_keywords = ['gst', 'igst', 'cgst', 'sgst', 'tax', 'i6st', 'ig5t', 'cg5t', 'sg5t']
            has_tax_keyword = any(keyword in line_lower for keyword in tax_keywords)
            
            if has_tax_keyword:
                # Skip CGST and SGST here - they should be handled by Pattern 3 above
                if 'cgst' in line_lower or 'sgst' in line_lower:
                    continue
                
                # Try to find amount on same line - prioritize amount AFTER percentage
                # Pattern 1: Tax keyword, (percentage%), then amount (e.g., "IGST (18%) 684.90")
                tax_with_percentage = re.search(
                    r'(?:IGST|GST|TAX).*?\([^)]+\)\s+(\d+(?:[.,]\d+)?)', 
                    line, re.IGNORECASE
                )
                if tax_with_percentage:
                    try:
                        amount_str = tax_with_percentage.group(1).replace(',', '')
                        gst_amount = float(amount_str)
                        # Validate it's a reasonable GST amount (not a percentage)
                        if 1.0 <= gst_amount < 1000000:  # Reasonable GST amount range (exclude percentages)
                            logger.info(f"Found GST/Tax amount (after percentage): ₹{gst_amount}")
                            return gst_amount
                    except ValueError:
                        pass
                
                # Pattern 2: Tax keyword followed by amount (no percentage)
                tax_amount_same_line = re.search(
                    r'(?:IGST|GST|TAX)\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)', 
                    line, re.IGNORECASE
                )
                if tax_amount_same_line:
                    try:
                        amount_str = tax_amount_same_line.group(1).replace(',', '')
                        gst_amount = float(amount_str)
                        # Validate it's a reasonable GST amount (not a percentage)
                        if 1.0 <= gst_amount < 1000000:  # Reasonable GST amount range (exclude percentages)
                            logger.info(f"Found GST/Tax amount on line: ₹{gst_amount}")
                            return gst_amount
                    except ValueError:
                        pass
                
                # Try to find amount on next line (common in table format)
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    # Look for amount pattern (number with optional decimal)
                    amount_match = re.search(r'[₹]?\s*(\d+(?:[.,]\d+)?)', next_line)
                    if amount_match:
                        try:
                            amount_str = amount_match.group(1).replace(',', '')
                            gst_amount = float(amount_str)
                            # Validate it's a reasonable GST amount (not too large, likely GST not total)
                            if 0 < gst_amount < 1000000:  # Reasonable GST amount range
                                logger.info(f"Found GST amount on next line: ₹{gst_amount}")
                                return gst_amount
                        except ValueError:
                            pass
                
                # Also check previous line for amount (sometimes amount comes before label)
                if i > 0:
                    prev_line = lines[i - 1].strip()
                    # Only check if previous line doesn't have tax keywords (to avoid double counting)
                    if not any(keyword in prev_line.lower() for keyword in tax_keywords):
                        amount_match = re.search(r'[₹]?\s*(\d+(?:[.,]\d+)?)', prev_line)
                        if amount_match:
                            try:
                                amount_str = amount_match.group(1).replace(',', '')
                                gst_amount = float(amount_str)
                                if 0 < gst_amount < 1000000:
                                    logger.info(f"Found GST amount on previous line: ₹{gst_amount}")
                                    return gst_amount
                            except ValueError:
                                pass
        
        # Pattern 9: Last resort - "GST:" anywhere (but exclude if it's part of "Total" or "Subtotal")
        # Only match if the line contains GST but NOT Total/Subtotal/Grand
        for line in lines:
            line_lower = line.lower()
            # Skip lines with Total, Subtotal, Grand Total, etc. to avoid confusion
            if any(word in line_lower for word in ['total', 'subtotal', 'grand', 'sum', 'net']):
                continue
            
            # More flexible pattern for GST
            gst_simple = re.search(r'GST\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)', line, re.IGNORECASE)
            if gst_simple:
                try:
                    amount_str = gst_simple.group(1).replace(',', '')  # Remove thousand separators
                    gst_amount = float(amount_str)
                    logger.info(f"Found GST amount (simple pattern): ₹{gst_amount}")
                    return gst_amount
                except ValueError:
                    continue
        
        # Pattern 10: Look for GST with percentage and amount (e.g., "GST @ 18%: ₹180")
        gst_with_rate = re.search(
            r'GST\s*[@]?\s*\d+%\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            text, re.IGNORECASE
        )
        if gst_with_rate:
            try:
                amount_str = gst_with_rate.group(1).replace(',', '')
                gst_amount = float(amount_str)
                logger.info(f"Found GST amount with rate: ₹{gst_amount}")
                return gst_amount
            except ValueError:
                pass
        
        # Pattern 11: Look for amounts in summary section (common format: "Add: IGST: 684.90")
        # This handles bills where tax is listed in a summary section
        summary_patterns = [
            r'Add\s*[:]?\s*(?:IGST|CGST|SGST|GST|Tax)\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)',
            r'(?:IGST|CGST|SGST|GST|Tax)\s*[:]?\s*[₹]?\s*(\d+(?:[.,]\d+)?)\s*Add',
        ]
        
        for pattern in summary_patterns:
            summary_match = re.search(pattern, text, re.IGNORECASE)
            if summary_match:
                try:
                    amount_str = summary_match.group(1).replace(',', '')
                    gst_amount = float(amount_str)
                    if 0 < gst_amount < 1000000:
                        logger.info(f"Found GST amount in summary section: ₹{gst_amount}")
                        return gst_amount
                except ValueError:
                    continue
        
        # Pattern 12: Look for any number near GST keyword (more lenient, but validate it's reasonable)
        # This is a fallback for bills with unusual formatting
        # Search line by line for better context
        for line in lines:
            line_lower = line.lower()
            # Skip lines with Total, Subtotal, Grand, Net to avoid confusion
            # But allow "Total IGST" or "Total GST" as those are valid
            if any(word in line_lower for word in ['subtotal', 'grand', 'net', 'sum', 'balance']):
                continue
            
            # Look for GST/IGST/CGST/SGST followed by amount on same line (handle OCR errors)
            tax_nearby = re.search(r'(?:IGST|CGST|SGST|GST|I6ST|IG5T|TAX).*?[₹]?\s*(\d+(?:[.,]\d+)?)', line, re.IGNORECASE)
            if tax_nearby:
                try:
                    amount_str = tax_nearby.group(1).replace(',', '')
                    gst_amount = float(amount_str)
                    # Validate it's a reasonable GST amount
                    if 0 < gst_amount < 1000000:  # Reasonable upper limit for GST
                        logger.info(f"Found GST amount (nearby pattern on line): ₹{gst_amount}")
                        return gst_amount
                except ValueError:
                    continue
            
            # Look for amount followed by GST/IGST on same line
            amount_before_tax = re.search(r'[₹]?\s*(\d+(?:[.,]\d+)?).*?(?:IGST|CGST|SGST|GST|TAX)', line, re.IGNORECASE)
            if amount_before_tax:
                try:
                    amount_str = amount_before_tax.group(1).replace(',', '')
                    gst_amount = float(amount_str)
                    if 0 < gst_amount < 1000000:
                        logger.info(f"Found GST amount (amount before tax keyword): ₹{gst_amount}")
                        return gst_amount
                except ValueError:
                    continue
        
        # Pattern 13: Last resort - look for decimal numbers that might be GST amounts
        # This handles cases where OCR is very garbled but numbers are still readable
        # Look for numbers with decimals in reasonable GST range (0.01 to 500000)
        # Only if they appear near tax-related context
        all_numbers = re.findall(r'(\d+(?:[.,]\d+)?)', text)
        potential_gst_amounts = []
        
        for num_str in all_numbers:
            try:
                # Clean the number string
                clean_num = num_str.replace(',', '')
                amount = float(clean_num)
                # Check if it's in reasonable GST range
                if 0.01 <= amount <= 500000:
                    # Check if it appears near tax-related keywords (within 100 chars for garbled text)
                    num_index = text.find(num_str)
                    context_start = max(0, num_index - 100)
                    context_end = min(len(text), num_index + len(num_str) + 100)
                    context = text[context_start:context_end].lower()
                    
                    # Look for tax-related keywords in context (including garbled versions)
                    tax_indicators = [
                        'gst', 'igst', 'cgst', 'sgst', 'tax', 
                        'i6st', 'ig5t', 'cg5t', 'sg5t', 'i65t',  # OCR errors
                        'add', 'total', 'ig5', 'cg5', 'sg5',  # Partial matches
                        'g5t', 'g6t', 't5t', 't6t'  # More OCR errors
                    ]
                    if any(indicator in context for indicator in tax_indicators):
                        # Check if it's not near "total amount" or "grand total"
                        if 'grand' not in context and 'total amount' not in context:
                            # Prefer amounts with decimals (more likely to be GST)
                            score = 1.0
                            if '.' in num_str:
                                score += 0.5  # Prefer decimal numbers
                            if amount >= 10:
                                score += 0.3  # Prefer reasonable amounts
                            potential_gst_amounts.append((amount, context, score))
            except ValueError:
                continue
        
        # If we found potential GST amounts, return the best one
        if potential_gst_amounts:
            # Sort by score (descending) then by amount (descending)
            potential_gst_amounts.sort(key=lambda x: (x[2], x[0]), reverse=True)
            for amount, context, score in potential_gst_amounts:
                # Prefer amounts that are not too small (likely GST not item price)
                if amount >= 1.0:  # GST amounts are usually at least ₹1
                    logger.info(f"Found potential GST amount (fallback pattern): ₹{amount} (score: {score}, context: {context[:80]}...)")
                    return amount
        
        logger.warning(f"Could not extract GST/Tax amount from image - no GST/tax-specific patterns found. OCR text preview: {text[:500]}...")
        return None
        
    except Exception as e:
        logger.error(f"Error extracting GST amount from image: {e}", exc_info=True)
        return None

