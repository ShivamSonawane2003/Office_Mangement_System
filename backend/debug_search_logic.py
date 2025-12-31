"""
Debug script to analyze SearchService logic for problematic queries.
"""
import sys
import os
import re
from difflib import SequenceMatcher, get_close_matches
from datetime import datetime

# Mock classes to simulate backend environment
class MockExpense:
    def __init__(self, id, label, item, category, amount, date, description="", gst_eligible=False, gst_amount=0):
        self.id = id
        self.label = label
        self.item = item
        self.category = category
        self.amount = amount
        self.date = date
        self.description = description
        self.status = "approved"
        self.gst_eligible = gst_eligible
        self.gst_amount = gst_amount

# Copying relevant logic from SearchService for debugging
class DebugSearchService:
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
        'pertol', 'petrole', 'fuel',
        # Financial terms
        'gst', 'tax', 'vat', 'rate', 'amount', 'cost', 'price', 'bill', 'invoice', 
        'receipt', 'total', 'sum', 'expense', 'expenses'
    ]

    @staticmethod
    def _correct_spelling(word: str) -> str:
        vocabulary = DebugSearchService.EXPENSE_VOCABULARY
        if not word or len(word) < 2: return word
        word_lower = word.lower()
        if word_lower in vocabulary: return word_lower
        
        # INCREASED THRESHOLD: Was 0.45-0.75, now stricter to avoid "GST"->"gas"
        for cutoff in [0.85, 0.80]:  # High similarity only
            close_matches = get_close_matches(word_lower, vocabulary, n=1, cutoff=cutoff)
            if close_matches:
                similarity = SequenceMatcher(None, word_lower, close_matches[0]).ratio()
                if similarity >= 0.8:  # At least 80% similarity
                    print(f"  [DEBUG] Corrected '{word}' -> '{close_matches[0]}' (Sim: {similarity:.2f})")
                    return close_matches[0]
        
        return word_lower

    @staticmethod
    def _extract_keywords(query: str) -> list:
        query_lower = query.lower()
        date_words = ['jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april',
                     'may', 'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'september',
                     'oct', 'october', 'nov', 'november', 'dec', 'december']
        
        stopwords = ['what', 'is', 'are', 'was', 'were', 'for', 'the', 'a', 'an', 'of', 
                    'to', 'in', 'on', 'at', 'with', 'by', 'from', 'about', 'how', 'much',
                    'did', 'i', 'spend', 'show', 'me', 'find', 'search', 'list']
                    
        words = re.findall(r'\b\w+\b', query_lower)
        keywords = [w for w in words if w not in date_words and w not in stopwords and len(w) > 2]
        print(f"  [DEBUG] Raw keywords: {keywords}")
        corrected_keywords = [DebugSearchService._correct_spelling(kw) for kw in keywords]
        return corrected_keywords

    @staticmethod
    def debug_match(query, expenses):
        print(f"\nAnalyzing Query: '{query}'")
        keywords = DebugSearchService._extract_keywords(query)
        print(f"  [DEBUG] Final Keywords: {keywords}")
        
        for expense in expenses:
            print(f"\n  Checking Expense: {expense.label} ({expense.category})")
            # INCLUDE DESCRIPTION
            expense_text = f"{expense.label} {expense.item} {expense.category} {expense.description}".lower()
            
            # Add GST context if expense has GST
            if expense.gst_eligible or expense.gst_amount > 0:
                expense_text += " gst tax"
                
            print(f"    [DEBUG] Text: '{expense_text}'")
            
            expense_words = set(re.findall(r'\b\w+\b', expense_text))
            
            keyword_match = False
            
            if keywords:
                for keyword in keywords:
                    # Exact match
                    if keyword in expense_text or keyword in expense_words:
                        keyword_match = True
                        print(f"    -> MATCH! Exact keyword '{keyword}' found in text")
                        break
                    # Fuzzy match
                    for exp_word in expense_words:
                        similarity = SequenceMatcher(None, keyword, exp_word).ratio()
                        if similarity >= 0.8: # Stricter threshold
                            keyword_match = True
                            print(f"    -> MATCH! Fuzzy '{keyword}' ~ '{exp_word}' (Sim: {similarity:.2f})")
                            break
                    if keyword_match: break
            else:
                print("    -> MATCH! No keywords to check")
                keyword_match = True

            if not keyword_match:
                print("    -> NO MATCH. Keywords not found.")

def main():
    # Mock data
    expenses = [
        MockExpense(1, "Petrol", "Fuel for trip", "Travel", 500.0, datetime(2025, 11, 15), description="Trip to site", gst_eligible=True, gst_amount=50),
        MockExpense(2, "Office Supplies", "Pens and paper", "Supplies", 450.0, datetime(2025, 11, 10), description="Stationery for office", gst_eligible=True, gst_amount=45),
        MockExpense(3, "Lunch", "Team lunch", "Food", 1200.0, datetime(2025, 11, 20), description="Lunch with client", gst_eligible=False, gst_amount=0),
        MockExpense(4, "Cake", "Chocolate Cake", "Food", 500.0, datetime(2025, 11, 21), description="Birthday celebration for Gaurav", gst_eligible=False, gst_amount=0)
    ]

    # Test Case 1: "What is GST rate for Laptop?"
    DebugSearchService.debug_match("What is GST rate for Laptop?", expenses)

    # Test Case 2: "GST in nov"
    DebugSearchService.debug_match("GST in nov", expenses)

    # Test Case 3: "Chocolate cake for Gaurav expense"
    DebugSearchService.debug_match("Chocolate cake for Gaurav expense", expenses)

if __name__ == "__main__":
    main()
