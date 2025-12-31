from sqlalchemy.orm import Session
from app.models.expense import Expense
from app.services.embedding_service import get_embedding_service
from sqlalchemy import extract
from datetime import datetime
import time
import re
from difflib import SequenceMatcher, get_close_matches

class SearchService:
    # Common expense-related words for spelling correction
    EXPENSE_VOCABULARY = [
        'petrol', 'diesel', 'food', 'lunch', 'dinner', 'breakfast', 'travel',
        'taxi', 'cab', 'uber', 'ola', 'hotel', 'transport', 'fuel', 'gas',
        'restaurant', 'cafe', 'coffee', 'snacks', 'groceries', 'stationery',
        'office', 'supplies', 'equipment', 'maintenance', 'repair', 'service',
        'internet', 'phone', 'mobile', 'utility', 'electricity', 'water',
        'rent', 'salary', 'medical', 'medicine', 'doctor', 'hospital',
        'insurance', 'premium', 'subscription', 'software', 'license',
        'training', 'workshop', 'seminar', 'conference', 'meeting',
        'entertainment', 'movie', 'cinema', 'parking', 'toll', 'ticket',
        'flight', 'train', 'bus', 'metro', 'shopping', 'gift', 'donation',
        # Add common variations and typos that should map to these
        'pertol', 'petrole', 'petrol',  # Common typo: pertol -> petrol
        'GST','GST eligible','GST rate','GST amount','GST tax','GST vat',
        # Financial terms
        'gst', 'tax', 'vat', 'rate', 'amount', 'cost', 'price', 'bill', 'invoice', 
        'receipt', 'total', 'sum', 'expense', 'expenses'
    ]
    
    # Typo correction map for common misspellings
    TYPO_CORRECTIONS = {
        'pertol': 'petrol',
        'petrole': 'petrol',
        'petrol': 'petrol',  # Keep as is
    }

    @staticmethod
    def _correct_spelling(word: str, vocabulary: list = None) -> str:
        """Correct spelling of a word using fuzzy matching with better typo tolerance"""
        if vocabulary is None:
            vocabulary = SearchService.EXPENSE_VOCABULARY
        
        if not word or len(word) < 2:
            return word
        
        word_lower = word.lower()
        
        # Check typo correction map first (for common misspellings)
        if word_lower in SearchService.TYPO_CORRECTIONS:
            return SearchService.TYPO_CORRECTIONS[word_lower]
        
        # Exact match
        if word_lower in vocabulary:
            return word_lower
        
        # Find close matches with higher tolerance for typos
        # Try with different cutoffs - lower cutoff = more tolerance for typos
        # INCREASED THRESHOLD: Was 0.45-0.75, now stricter to avoid "GST"->"gas"
        for cutoff in [0.75, 0.70, 0.65]:  # More lenient for common typos like "pertol"
            close_matches = get_close_matches(word_lower, vocabulary, n=1, cutoff=cutoff)
            if close_matches:
                # Verify it's a good match using SequenceMatcher
                similarity = SequenceMatcher(None, word_lower, close_matches[0]).ratio()
                if similarity >= 0.7:  # At least 70% similarity for typos
                    corrected = close_matches[0]
                    # Special handling for "pertol" -> "petrol"
                    if word_lower == 'pertol' and corrected == 'petrol':
                        return 'petrol'
                    return corrected
        
        # Also try matching against substrings (for partial matches)
        # Only for longer words to avoid false positives
        if len(word_lower) > 4:
            for vocab_word in vocabulary:
                # Check if word is a substring or vice versa
                if word_lower in vocab_word or vocab_word in word_lower:
                    similarity = SequenceMatcher(None, word_lower, vocab_word).ratio()
                    if similarity >= 0.7: # More lenient threshold for typos
                        return vocab_word
        
        return word_lower

    @staticmethod
    def _normalize_query(query: str) -> str:
        """Normalize query with spelling correction"""
        query_lower = query.lower()
        words = re.findall(r'\b\w+\b', query_lower)
        corrected_words = [SearchService._correct_spelling(word) for word in words]
        return ' '.join(corrected_words)

    @staticmethod
    def _extract_keywords(query: str, db: Session = None) -> dict:
        """Extract main keywords from query, including person names and multi-word phrases"""
        query_lower = query.lower()
        # Remove date-related words
        date_words = ['jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april',
                     'may', 'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'september',
                     'oct', 'october', 'nov', 'november', 'dec', 'december']
        
        # Common stopwords to remove
        stopwords = ['what', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 
                    'to', 'on', 'at', 'with', 'by', 'from', 'about', 'how', 'much',
                    'did', 'i', 'spend', 'show', 'me', 'find', 'search', 'list']
        
        # Keep "for" and "in" as they might indicate relationships (e.g., "for Gaurav", "in nov")
        
        # Extract person names (capitalized words, typically after "for")
        person_names = []
        # Pattern: "for [Name]" (case-insensitive, but preserve original case)
        person_pattern = r'\bfor\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)\b'
        matches = re.findall(person_pattern, query, re.IGNORECASE)
        person_names.extend([m for m in matches if len(m) > 2])
        
        # Also check for standalone capitalized words in original query (potential names)
        # First, try to find capitalized words in the original query (not lowercased)
        capitalized_words = re.findall(r'\b[A-Z][a-z]+\b', query)
        for word in capitalized_words:
            word_lower = word.lower()
            if word_lower not in date_words and word_lower not in stopwords and len(word) > 2:
                # Could be a name or important keyword - add to person_names
                if word not in person_names:  # Avoid duplicates
                    person_names.append(word)
        
        # Also check lowercase words that might be names (after "for")
        # Look for pattern: "for [word]" where word is not a stopword/date
        for_lower_pattern = r'\bfor\s+([a-z]{3,})\b'
        for_matches = re.findall(for_lower_pattern, query_lower)
        for match in for_matches:
            if match not in date_words and match not in stopwords:
                # Could be a person name in lowercase
                if match not in [pn.lower() for pn in person_names]:
                    person_names.append(match.capitalize())  # Capitalize for matching
        
        # Split query into words
        words = re.findall(r'\b\w+\b', query_lower)
        # Filter out date words, stopwords, short words, and person names
        person_names_lower = [name.lower() for name in person_names]
        keywords = [w for w in words if w not in date_words and w not in stopwords 
                   and len(w) > 2 and w not in person_names_lower]
        
        # Extract multi-word phrases (important for items like "Chocolate cake")
        # Look for patterns like "X expense", "X for Y", etc.
        phrases = []
        # Pattern: "X expense" or "expense X" - extract X
        expense_patterns = [
            r'\b(.+?)\s+expense\b',
            r'\bexpense\s+(.+?)\b'
        ]
        for pattern in expense_patterns:
            matches = re.findall(pattern, query_lower)
            for match in matches:
                # Clean up the match (remove stopwords, dates)
                match_words = [w for w in re.findall(r'\b\w+\b', match) 
                              if w not in stopwords and w not in date_words]
                if len(match_words) >= 2:  # Multi-word phrase
                    phrases.append(' '.join(match_words))
        
        # Also check for quoted phrases
        quoted_phrases = re.findall(r'"([^"]+)"', query_lower)
        phrases.extend(quoted_phrases)
        
        # Build vocabulary from database if available
        vocabulary = list(SearchService.EXPENSE_VOCABULARY)
        person_names_from_db = []
        if db:
            try:
                # Get unique categories, labels, and items from expenses
                categories = db.query(Expense.category).distinct().all()
                labels = db.query(Expense.label).distinct().limit(100).all()
                items = db.query(Expense.item).distinct().limit(100).all()
                
                vocabulary.extend([cat[0].lower() for cat in categories if cat[0]])
                vocabulary.extend([lab[0].lower() for lab in labels if lab[0]])
                vocabulary.extend([itm[0].lower() for itm in items if itm[0]])
                # Extract words from items/labels
                for item in items:
                    if item[0]:
                        vocabulary.extend(re.findall(r'\b\w+\b', item[0].lower()))
                
                # Get user names from User model (for person name matching)
                from app.models.user import User
                users = db.query(User.full_name).filter(User.full_name.isnot(None)).all()
                for user in users:
                    if user[0]:
                        person_names_from_db.append(user[0])
                vocabulary = list(set(vocabulary))  # Remove duplicates
            except:
                pass
        
        # Correct spelling of keywords
        corrected_keywords = [SearchService._correct_spelling(kw, vocabulary) for kw in keywords]
        
        return {
            'keywords': corrected_keywords,
            'person_names': person_names,
            'phrases': phrases,
            'person_names_from_db': person_names_from_db
        }

    @staticmethod
    def _extract_month_from_query(query: str) -> int:
        """Extract month number from query (e.g., 'nov', 'november', '11')"""
        query_lower = query.lower()
        month_map = {
            'jan': 1, 'january': 1,
            'feb': 2, 'february': 2,
            'mar': 3, 'march': 3,
            'apr': 4, 'april': 4,
            'may': 5,
            'jun': 6, 'june': 6,
            'jul': 7, 'july': 7,
            'aug': 8, 'august': 8,
            'sep': 9, 'september': 9,
            'oct': 10, 'october': 10,
            'nov': 11, 'november': 11,
            'dec': 12, 'december': 12
        }
        
        for key, month_num in month_map.items():
            if key in query_lower:
                return month_num
        
        # Try to find month number (1-12)
        month_match = re.search(r'\b(1[0-2]|[1-9])\b', query)
        if month_match:
            return int(month_match.group(1))
        
        return None

    @staticmethod
    def _extract_year_from_query(query: str) -> int:
        """Extract year from query"""
        year_match = re.search(r'\b(20\d{2})\b', query)
        if year_match:
            return int(year_match.group(1))
        return datetime.now().year

    @staticmethod
    def semantic_search(db: Session, query: str, limit: int = 10, 
                       min_amount: float = None, max_amount: float = None,
                       user_id: int = None):
        """
        Perform semantic search using EMBEDDING MODEL (sentence-transformers/all-MiniLM-L6-v2).
        
        This is the ONLY method for searching ALL database items (expenses AND GST claims).
        The embedding model performs all database searches - Qwen model never searches.
        
        Returns: List of matching expenses and GST claims with similarity scores from embedding search.
        All data from ALL users is included in the search (user_id filter applied after embedding search).
        """
        start_time = time.time()

        # Normalize query with spelling correction
        normalized_query = SearchService._normalize_query(query)
        
        # Extract keywords and date information with spelling correction
        keyword_data = SearchService._extract_keywords(query, db)
        keywords = keyword_data.get('keywords', [])
        person_names = keyword_data.get('person_names', [])
        phrases = keyword_data.get('phrases', [])
        person_names_from_db = keyword_data.get('person_names_from_db', [])
        
        month = SearchService._extract_month_from_query(query)
        year = SearchService._extract_year_from_query(query)

        # Check if query is about GST
        is_gst_query = any(term in query.lower() for term in ['gst', 'tax', 'vat', 'gst eligible'])
        
        # Check if query contains specific item keywords (like "cake", "petrol", etc.)
        # These are common expense items that should trigger strict filtering
        query_lower = normalized_query.lower()
        has_specific_item_keyword = False
        specific_item_keywords = []
        if keywords:
            # List of common words to exclude (not specific items)
            excluded_words = {'expense', 'expenses', 'in', 'nov', 'november', 'dec', 'december', 
                            'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 
                            'may', 'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'september', 
                            'oct', 'october', 'for', 'the', 'a', 'an', 'at', 'of', 'on', 'with', 'from'}
            
            # Check if any keyword matches common expense item patterns
            for keyword in keywords:
                keyword_lower = keyword.lower()
                # Only include keywords that aren't common words - these are likely specific items
                if keyword_lower not in excluded_words and len(keyword_lower) > 2:
                    has_specific_item_keyword = True
                    specific_item_keywords.append(keyword_lower)

        # Use EMBEDDING MODEL for database search (sentence-transformers/all-MiniLM-L6-v2)
        # This is the ONLY method for searching - Qwen model does NOT search
        # Search returns (item_type, item_id, similarity_score) for both expenses and GST claims
        embedding_service = get_embedding_service()
        # For specific item queries, search more widely to ensure we find ALL matching items
        search_k = limit * 10 if has_specific_item_keyword else limit * 5
        embedding_search_results = embedding_service.search(normalized_query, k=search_k)

        results = []
        keyword_matched_results = []
        date_keyword_matched_results = []
        gst_results_from_embedding = []  # GST claims found via embedding search
        
        # Import here to avoid circular imports
        from sqlalchemy.orm import joinedload
        from app.models.gst_claim import GSTClaim

        def process_expense_result(expense, similarity_score):
            """Evaluate matching rules for an expense and append to appropriate buckets."""
            # Build comprehensive search text including user information
            expense_text_parts = [expense.label.lower(), expense.item.lower(), expense.category.lower()]
            if expense.description:
                expense_text_parts.append(expense.description.lower())
            
            if hasattr(expense, 'user') and expense.user and expense.user.full_name:
                expense_text_parts.append(expense.user.full_name.lower())
            
            expense_text = ' '.join(expense_text_parts)
            if expense.gst_eligible or expense.gst_amount > 0:
                expense_text += " gst tax gst-eligible"
            
            expense_words = set(re.findall(r'\b\w+\b', expense_text))
            
            keyword_match = False
            person_name_match = False
            phrase_match = False
            gst_match = False
            
            # GST query handling - STRICT filtering: only include GST-eligible expenses
            if is_gst_query:
                if expense.gst_eligible or expense.gst_amount > 0:
                    gst_match = True
                else:
                    # For GST queries, EXCLUDE non-GST expenses completely
                    return
            
            # Person name matching - only filter if person name is explicitly mentioned
            if person_names:
                for person_name in person_names:
                    person_lower = person_name.lower()
                    if person_lower in expense_text:
                        person_name_match = True
                        break
                    for db_name in person_names_from_db:
                        if person_lower in db_name.lower() or db_name.lower() in person_lower:
                            if hasattr(expense, 'user') and expense.user and expense.user.full_name:
                                if person_lower in expense.user.full_name.lower():
                                    person_name_match = True
                                    break
                    if person_name_match:
                        break
                # Only filter out if person name specified but no match
                # If no person name match, continue but don't boost score
            
            # Phrase matching - be lenient
            if phrases:
                matched_phrase = False
                for phrase in phrases:
                    phrase_lower = phrase.lower()
                    if phrase_lower in expense_text:
                        words = phrase_lower.split()
                        if all(any(word in exp_word or exp_word in word for exp_word in expense_words) for word in words):
                            matched_phrase = True
                            break
                # Don't return early - allow phrase or keyword match or semantic similarity
                if matched_phrase:
                    phrase_match = True

            # Keyword matching - be lenient, allow fuzzy matches
            if keywords:
                for keyword in keywords:
                    if keyword in expense_text or keyword in expense_words:
                        keyword_match = True
                        break
                    for exp_word in expense_words:
                        similarity = SequenceMatcher(None, keyword, exp_word).ratio()
                        if similarity >= 0.7:  # Lowered from 0.8 for better recall
                            keyword_match = True
                            break
                    if keyword_match:
                        break
                # Don't return early - allow semantic similarity to carry through

            match_score_boost = 1.0
            if person_names:
                match_score_boost = max(match_score_boost, 1.5)
            if phrase_match:
                match_score_boost = max(match_score_boost, 1.4)
            if keyword_match:
                match_score_boost = max(match_score_boost, 1.3)
            if is_gst_query and gst_match:
                match_score_boost = max(match_score_boost, 1.3)
            
            # Check for exact keyword match (e.g., "cake" in query and expense label/item)
            exact_keyword_match = False
            expense_label_lower = expense.label.lower()
            expense_item_lower = expense.item.lower() if expense.item else ""
            expense_text_for_keyword = f"{expense_label_lower} {expense_item_lower}"
            
            # If query has specific item keywords, STRICTLY filter: only include expenses with that keyword
            if has_specific_item_keyword:
                keyword_found_in_expense = False
                for item_keyword in specific_item_keywords:
                    if item_keyword in expense_label_lower or item_keyword in expense_item_lower:
                        keyword_found_in_expense = True
                        exact_keyword_match = True
                        # Boost score significantly for exact keyword matches
                        match_score_boost = max(match_score_boost, 2.0)
                        break
                
                # STRICT: If query has specific item keyword (like "cake"), EXCLUDE expenses without that keyword
                if not keyword_found_in_expense:
                    return  # Filter out expenses that don't match the specific item keyword
            
            # Date matching - STRICT for queries with month specified
            date_match = True
            if month and expense.date:
                if expense.date.month == month and expense.date.year == year:
                    match_score_boost = max(match_score_boost, 1.2)
                    date_match = True
            else:
                    # For queries with explicit month, STRICTLY filter by date - no exceptions
                    # Must match the specified month exactly
                    date_match = False
                    return  # Filter out expenses that don't match the specified month/year
            
            # Filtering based on similarity - be lenient for exact keyword matches
            if exact_keyword_match:
                # Don't filter out exact keyword matches even with lower similarity
                # This ensures ALL matching expenses are included (e.g., all "cake" expenses)
                pass
            elif not person_names and not phrases and not keywords and not is_gst_query:
                match_score_boost = 1.0
                # Accept results based on embedding similarity alone (threshold lowered)
                if float(similarity_score) < 0.3:  # Lowered threshold for better recall
                    return
            elif float(similarity_score) < 0.4:
                return

            result_data = {
                "id": expense.id,
                "type": "expense",
                "label": expense.label,
                "item": expense.item,
                "amount": expense.amount,
                "category": expense.category,
                "status": expense.status,
                "similarity_score": float(similarity_score) * match_score_boost
            }
            
            # Categorize results - for GST queries, only include GST-eligible expenses (already filtered)
            if date_match and (keyword_match or phrase_match or person_name_match or gst_match):
                date_keyword_matched_results.append(result_data)
            elif keyword_match or phrase_match or person_name_match or gst_match:
                keyword_matched_results.append(result_data)
            else:
                # Only add to results if it's not a GST query OR if it has GST match
                # (For GST queries, non-GST expenses already filtered out above)
                if not is_gst_query or gst_match:
                    results.append(result_data)
        
        # Process embedding search results - handle both expenses and GST claims
        for item_type, item_id, similarity_score in embedding_search_results:
            if item_type == "expense":
                expense = db.query(Expense).options(joinedload(Expense.user)).filter(Expense.id == item_id).first()
                if not expense:
                    continue
                
                if user_id and expense.user_id != user_id:
                    continue

                if min_amount and expense.amount < min_amount:
                    continue
                if max_amount and expense.amount > max_amount:
                    continue

                process_expense_result(expense, similarity_score)
            
            elif item_type == "gst_claim":
                # Process GST claim result from embedding search
                gst_claim = db.query(GSTClaim).options(joinedload(GSTClaim.user)).filter(GSTClaim.id == item_id).first()
                if not gst_claim:
                    continue
                
                # Filter by user if user_id provided (but embeddings include ALL users' data)
                if user_id and gst_claim.user_id != user_id:
                    continue
                
                if min_amount and gst_claim.amount < min_amount:
                    continue
                if max_amount and gst_claim.amount > max_amount:
                    continue
                
                # Build search text for GST claim
                gst_text_parts = [gst_claim.vendor.lower(), gst_claim.category.lower()]
                gst_text = ' '.join(gst_text_parts) + " gst tax vat gst-eligible gst-claim"
                
                # Add user full name if available
                if hasattr(gst_claim, 'user') and gst_claim.user and gst_claim.user.full_name:
                    gst_text += f" {gst_claim.user.full_name.lower()}"
                
                gst_words = set(re.findall(r'\b\w+\b', gst_text))
                
                # Match tracking for GST
                keyword_match = False
                phrase_match = False
                
                # Check phrase matches
                if phrases:
                    for phrase in phrases:
                        phrase_lower = phrase.lower()
                        if phrase_lower in gst_text:
                            phrase_match = True
                            break
                
                # Check keyword matches
                if keywords:
                    for keyword in keywords:
                        if keyword in gst_text or keyword in gst_words:
                            keyword_match = True
                            break
                
                # For GST queries, always include GST claims
                if is_gst_query:
                    keyword_match = True
                
                # Determine overall match for GST
                overall_match = False
                match_score_boost = 1.0
                
                if phrases:
                    if phrase_match or keyword_match:
                        overall_match = True
                        if phrase_match:
                            match_score_boost = 1.4
                elif keywords:
                    if keyword_match:
                        overall_match = True
                        match_score_boost = 1.3
                elif is_gst_query:
                    overall_match = True
                    match_score_boost = 1.5  # Boost for GST queries
                else:
                    overall_match = True  # Include all GST claims from embedding search
                
                if not overall_match:
                    continue
                
                # Filter out low similarity results - be more lenient for GST
                if float(similarity_score) < 0.3:  # Lowered threshold for better recall
                    continue
                
                # Check date match if month is specified - strict for month queries
                date_match = True
                if month and gst_claim.created_at:
                    gst_month = gst_claim.created_at.month
                    gst_year = gst_claim.created_at.year
                    if gst_month == month and gst_year == year:
                        date_match = True
                        match_score_boost = max(match_score_boost, 1.2)
                    else:
                        date_match = False
                        # For queries with explicit month (like "GST in Nov"), strictly filter by date
                        # Only allow if similarity is VERY high (unlikely to happen)
                        if float(similarity_score) < 0.7:
                            continue

                # Build GST result data
                gst_result_data = {
                    "id": gst_claim.id,
                    "type": "gst_claim",
                    "label": f"GST Claim: {gst_claim.vendor}",
                    "item": gst_claim.vendor,
                    "amount": gst_claim.amount,
                    "gst_amount": gst_claim.gst_amount,
                    "category": gst_claim.category,
                    "status": gst_claim.status,
                    "similarity_score": float(similarity_score) * match_score_boost
                }
                
                # Add to GST results list - prioritize date matches
                if date_match and overall_match:
                    date_keyword_matched_results.append(gst_result_data)
                elif overall_match:
                    keyword_matched_results.append(gst_result_data)
                else:
                    # Include all GST results from embedding search
                    gst_results_from_embedding.append(gst_result_data)

        # Combine results: date+keyword matched first, then keyword matched, then others, then GST results
        all_results = date_keyword_matched_results + keyword_matched_results + results + gst_results_from_embedding
        
        # For exact keyword matches (like "cake"), ensure all matching expenses are included
        # Deduplicate by expense ID while preserving all unique matches
        seen_ids = set()
        deduplicated_results = []
        
        # First pass: Add all date+keyword matched results (highest priority)
        for result in date_keyword_matched_results:
            result_key = (result.get('type'), result.get('id'))
            if result_key not in seen_ids:
                seen_ids.add(result_key)
                deduplicated_results.append(result)
        
        # Second pass: Add keyword matched results
        for result in keyword_matched_results:
            result_key = (result.get('type'), result.get('id'))
            if result_key not in seen_ids:
                seen_ids.add(result_key)
                deduplicated_results.append(result)
        
        # Third pass: Add remaining results
        for result in results + gst_results_from_embedding:
            result_key = (result.get('type'), result.get('id'))
            if result_key not in seen_ids:
                seen_ids.add(result_key)
                deduplicated_results.append(result)
        
        # Sort by similarity score (highest first)
        deduplicated_results.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # Return top results - for specific item keyword queries, return ALL matches
        # For other queries, use the limit
        if has_specific_item_keyword:
            # For specific item queries (like "cake expense"), return ALL matching results
            final_results = deduplicated_results
        else:
            max_limit = limit * 3 if keywords or phrases else limit
            final_results = deduplicated_results[:max_limit]

        execution_time = (time.time() - start_time) * 1000

        return {
            "query": query,
            "total_results": len(final_results),
            "results": final_results,
            "execution_time_ms": round(execution_time, 2)
        }
