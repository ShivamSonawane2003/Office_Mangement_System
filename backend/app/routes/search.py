from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.search import SearchRequest, SearchResponse, ChatbotRequest, ChatbotResponse
from app.services.search_service import SearchService
from app.services.chatbot_service import ChatbotService
from app.security import get_current_user, TokenData, require_role
from typing import Optional, List, Dict

router = APIRouter(prefix="/api/search", tags=["search"])

@router.post("/", response_model=SearchResponse)
async def semantic_search(
    request: SearchRequest,
    current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
    db: Session = Depends(get_db)
):
    return SearchService.semantic_search(
        db, 
        request.query,
        request.limit,
        request.min_amount,
        request.max_amount,
        user_id=current_user.user_id
    )

@router.post("/chat", response_model=ChatbotResponse)
async def chatbot(
    request: ChatbotRequest,
    current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
    db: Session = Depends(get_db)
):
    """
    AI Chatbot endpoint that uses EMBEDDING MODEL for database search and QWEN MODEL for answer generation.
    
    Architecture:
    1. EMBEDDING MODEL (sentence-transformers/all-MiniLM-L6-v2) - Handles ALL database searching
    2. QWEN MODEL (Qwen/Qwen3-0.6B) - ONLY creates natural language answers from search results
    
    The embedding model performs semantic search, Qwen model NEVER searches - it only formats answers.
    """
    chatbot_service = ChatbotService.get_instance()
    
    # Define greeting words to skip search
    greetings = {'hi', 'hello', 'hey', 'help', 'greetings', 'good morning', 'good afternoon', 'good evening'}
    is_greeting = request.query.strip().lower() in greetings
    
    # STEP 1: Use EMBEDDING MODEL to search database (ONLY method for searching)
    # The embedding model handles ALL database searches - Qwen never searches
    # This now searches BOTH expenses AND GST claims from ALL users via embeddings
    search_results = {"results": []}
    
    if not is_greeting:
        try:
            # Use embedding model for semantic search (this is the ONLY search method)
            # SearchService.semantic_search() uses EmbeddingService which uses sentence-transformers
            # It now returns BOTH expenses and GST claims from embedding search
            # Chatbot should search ALL expenses from ALL users to answer queries like "cake for Gaurav"
            # Don't filter by user_id - allow searching across all employees' data
            search_results = SearchService.semantic_search(
                db,
                request.query,
                limit=20,  # Increased limit to ensure all matching expenses are included
                user_id=None  # Search all users' data for comprehensive answers
            )
        except Exception as e:
            print(f"Error in embedding search: {e}")
            import traceback
            traceback.print_exc()
    
    # STEP 2: Format embedding search results as context for Qwen model
    # Qwen model will ONLY use these results to create answers - it does NOT search
    context = None
    all_results = []
    
    # Search results now contain BOTH expenses and GST claims from embedding search
    if search_results.get("results"):
        all_results.extend(search_results["results"])
    
    if all_results:
        # Format context from EMBEDDING SEARCH RESULTS for Qwen to use
        # Qwen will read this and create natural language answers - NO searching by Qwen
        context = "=== EMBEDDING SEARCH RESULTS (from sentence-transformers/all-MiniLM-L6-v2) ===\n"
        context += f"Query: '{request.query}'\n"
        context += f"Search Method: Semantic Embedding Search (sentence-transformers/all-MiniLM-L6-v2)\n"
        context += f"Results Found: {len(all_results)}\n"
        context += "\n--- DETAILED RESULTS FROM EMBEDDING SEARCH ---\n"
        
        total_amount = 0
        expense_count = 0
        gst_count = 0
        
        # For month-specific queries, show all results to ensure accurate totals
        # Check if query contains a month
        query_lower = request.query.lower()
        has_month = any(month in query_lower for month in [
            'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april',
            'may', 'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'september',
            'oct', 'october', 'nov', 'november', 'dec', 'december'
        ])
        
        # Show all results for month queries, limit to 10 for others
        max_results_to_show = len(all_results) if has_month else min(10, len(all_results))
        
        for idx, result in enumerate(all_results[:max_results_to_show], 1):
            if result.get('type') == 'gst_claim':
                # Format GST claim with full details from embedding search
                context += f"\n{idx}. [GST CLAIM - Found by Embedding Search]\n"
                # Vendor is stored in 'item' field for GST claims from search service
                vendor = result.get('vendor') or result.get('item', 'N/A')
                context += f"   Vendor: {vendor}\n"
                context += f"   Amount: ₹{result.get('amount', 0)}\n"
                if result.get('gst_amount') is not None:
                    context += f"   GST Amount: ₹{result['gst_amount']}\n"
                context += f"   Category: {result.get('category', 'N/A')}\n"
                context += f"   Status: {result.get('status', 'N/A')}\n"
                if result.get('similarity_score'):
                    similarity_pct = round(result['similarity_score'] * 100, 1)
                    context += f"   Match Score: {similarity_pct}% (embedding similarity from sentence-transformers)\n"
                total_amount += result.get('amount', 0)
                gst_count += 1
            else:
                # Format expense with full details from embedding search
                # CRITICAL: Always use the Category field from the search result - do NOT guess or change it
                context += f"\n{idx}. [EXPENSE - Found by Embedding Search]\n"
                context += f"   Label: {result.get('label', 'N/A')}\n"
                context += f"   Item: {result.get('item', 'N/A')}\n"
                context += f"   Amount: ₹{result.get('amount', 0)}\n"
                context += f"   Category: {result.get('category', 'N/A')} (USE THIS EXACT CATEGORY - DO NOT CHANGE)\n"
                if result.get('similarity_score'):
                    similarity_pct = round(result['similarity_score'] * 100, 1)
                    context += f"   Match Score: {similarity_pct}% (embedding similarity from sentence-transformers)\n"
                total_amount += result.get('amount', 0)
                expense_count += 1
        
        # Add comprehensive summary - recalculate from displayed results only
        displayed_total = 0
        displayed_expense_count = 0
        displayed_gst_count = 0
        
        # Recalculate totals from displayed results only
        for result in all_results[:max_results_to_show]:
            if result.get('type') == 'gst_claim':
                displayed_total += result.get('amount', 0)
                displayed_gst_count += 1
            else:
                displayed_total += result.get('amount', 0)
                displayed_expense_count += 1
        
        context += "\n=== SUMMARY ===\n"
        context += f"Total Expenses Found: {displayed_expense_count}\n"
        if displayed_gst_count > 0:
            context += f"Total GST Claims Found: {displayed_gst_count}\n"
        context += f"Total Amount: ₹{displayed_total:.2f}\n"
        context += f"Number of Results Displayed: {max_results_to_show} (out of {len(all_results)} total found)\n"
        context += "\nIMPORTANT: These results are from embedding search (sentence-transformers/all-MiniLM-L6-v2).\n"
        context += "CRITICAL INSTRUCTIONS:\n"
        context += "1. Use ONLY these results to answer. Do NOT search or make up any data.\n"
        context += "2. Use the EXACT Category shown in each result - DO NOT change or guess categories.\n"
        context += "3. If Category shows 'Travel', say 'travel'. If it shows 'Food', say 'food'. Use the exact category from the results.\n"
        context += "4. For petrol/fuel expenses, check the Category field - if it says 'Travel', the expense is categorized under travel, NOT food.\n"
        context += f"5. The total amount shown (₹{displayed_total:.2f}) is calculated from the {max_results_to_show} result(s) displayed above.\n"
    elif not is_greeting:
        context = "=== EMBEDDING SEARCH RESULTS ===\n"
        context += f"Query: '{request.query}'\n"
        context += f"Search Method: Semantic Embedding Search (sentence-transformers/all-MiniLM-L6-v2)\n"
        context += "Results Found: 0\n"
        context += "No expenses or GST claims found matching the query using embedding search.\n"
        context += "Answer based on this: no results found from embedding search.\n"
    
    # STEP 3: Use QWEN MODEL to create natural language answer from search results
    # Qwen model does NOT search - it ONLY formats the embedding search results into an answer
    conversation_history = request.conversation_history or []
    ai_response = chatbot_service.generate_response(
        user_query=request.query,
        conversation_history=conversation_history,
        context=context  # Pass embedding search results to Qwen for answer generation only
    )
    
    # All results are already in search_results from embedding search (both expenses and GST claims)
    all_search_results = search_results.get("results", [])
    
    return ChatbotResponse(
        query=request.query,
        response=ai_response,
        search_results=all_search_results,
        has_results=len(all_search_results) > 0
    )
