from transformers import AutoTokenizer, AutoModelForCausalLM
from transformers import __version__ as transformers_version
import torch
from typing import List, Dict, Optional
import os

class ChatbotService:
    _instance = None
    _model = None
    _tokenizer = None
    _initialized = False
    _model_name = None

    def __init__(self):
        if ChatbotService._instance is not None:
            raise Exception("ChatbotService is a singleton")
        ChatbotService._instance = self

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def initialize_model(self, model_name: str = None, token: str = None):
        """Initialize the chatbot model and tokenizer"""
        if self._initialized:
            return
        
        # Check transformers version for Qwen3 support
        try:
            version_parts = transformers_version.split('.')
            major_version = int(version_parts[0])
            minor_version = int(version_parts[1]) if len(version_parts) > 1 else 0
            has_qwen3_support = (major_version > 4) or (major_version == 4 and minor_version >= 51)
        except:
            has_qwen3_support = False
        
        # List of models to try (Qwen3-0.6B first as primary choice)
        model_candidates = []
        
        # Only add Qwen3 if transformers version supports it
        if has_qwen3_support:
            model_candidates.append("Qwen/Qwen3-0.6B")  # Primary choice - Qwen3-0.6B for better responses
        else:
            print(f"⚠️ Warning: transformers version {transformers_version} doesn't support Qwen3. Need >=4.51.0. Using fallback models.")
        
        model_candidates.extend([
            "Qwen/Qwen2.5-0.5B-Instruct",  # Fallback option
            "TinyLlama/TinyLlama-1.1B-Chat-v1.0",  # Fallback if Qwen models fail
        ])
        
        # Add Gemma models if token provided (for gated access)
        if token:
            model_candidates.insert(0, "google/gemma-2b-it")
            model_candidates.insert(1, "google/gemma-2-2b-it")
        
        # Use provided model_name if specified, otherwise try candidates
        models_to_try = [model_name] if model_name else model_candidates
        
        for candidate_model in models_to_try:
            try:
                print(f"Loading chatbot model: {candidate_model}...")
                
                # Prepare kwargs for loading
                load_kwargs = {
                    "cache_dir": "./models",
                    "trust_remote_code": True
                }
                
                # Add token if provided (for gated models)
                if token:
                    load_kwargs["token"] = token
                
                # Load tokenizer
                self._tokenizer = AutoTokenizer.from_pretrained(
                    candidate_model,
                    **load_kwargs
                )
                
                # Set padding token if not present
                if self._tokenizer.pad_token is None:
                    self._tokenizer.pad_token = self._tokenizer.eos_token
                
                # For Qwen models, ensure chat template is available
                if "qwen" in candidate_model.lower() and not hasattr(self._tokenizer, 'apply_chat_template'):
                    # Fallback to manual prompt building if chat template not available
                    print(f"Note: Chat template not available for {candidate_model}, will use manual prompts")
                
                # Load model
                model_kwargs = {
                    "cache_dir": "./models",
                    "torch_dtype": torch.float16 if torch.cuda.is_available() else torch.float32,
                    "device_map": "auto" if torch.cuda.is_available() else None,
                    "trust_remote_code": True,
                    "low_cpu_mem_usage": True
                }
                
                # For Qwen3, use torch_dtype="auto" as recommended
                if "qwen3" in candidate_model.lower():
                    model_kwargs["torch_dtype"] = "auto"
                
                if token:
                    model_kwargs["token"] = token
                
                self._model = AutoModelForCausalLM.from_pretrained(
                    candidate_model,
                    **model_kwargs
                )
                
                # Move to CPU if no GPU available
                if not torch.cuda.is_available():
                    self._model = self._model.to("cpu")
                
                self._model.eval()  # Set to evaluation mode
                self._initialized = True
                self._model_name = candidate_model
                print(f"✓ Chatbot model '{candidate_model}' loaded successfully!")
                return
                
            except Exception as e:
                print(f"Failed to load {candidate_model}: {str(e)[:100]}")
                # Clear any partial loads
                self._tokenizer = None
                self._model = None
                continue
        
        # If all models failed
        print("⚠️ Could not load any chatbot model. Using fallback responses.")
        print("💡 Tip: For better responses, you can:")
        print("   1. Request access to Gemma models at https://huggingface.co/google/gemma-2b-it")
        print("   2. Set HUGGINGFACE_TOKEN environment variable")
        print("   3. Or the system will use enhanced text-based responses")
        self._initialized = False
    
    def _is_expense_related_query(self, query: str) -> bool:
        """Check if query is related to office expenses - validation gate"""
        query_lower = query.strip().lower()
        
        # Very short queries or greetings are okay
        if len(query_lower) < 3 or query_lower in ['hi', 'hello', 'hey', 'help']:
            return True
        
        # Expense-related keywords
        expense_keywords = [
            # Core expense terms
            'expense', 'expenses', 'cost', 'amount', 'price', 'rupee', 'rs', '₹', 'spent',
            'spending', 'bill', 'bills', 'invoice', 'receipt', 'payment', 'reimbursement',
            
            # Expense categories
            'petrol', 'fuel', 'diesel', 'gas', 'travel', 'transport', 'taxi', 'cab', 'uber',
            'ola', 'food', 'lunch', 'dinner', 'breakfast', 'meal', 'restaurant', 'hotel',
            'office', 'stationery', 'supplies', 'equipment', 'maintenance', 'repair',
            'internet', 'phone', 'mobile', 'utility', 'electricity', 'water', 'rent',
            'salary', 'medical', 'medicine', 'doctor', 'insurance', 'subscription',
            
            # Time/date (often used in expense queries)
            'month', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
            'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'january', 'february', 'march',
            'april', 'june', 'july', 'august', 'september', 'october', 'today', 'yesterday',
            'week', 'year', 'date',
            
            # Actions related to expenses
            'search', 'find', 'show', 'list', 'total', 'sum', 'report', 'analysis',
            'category', 'categories', 'how much', 'what is', 'display'
        ]
        
        # Non-expense topics that should be rejected
        non_expense_topics = [
            # General knowledge
            'who is', 'what is the', 'capital of', 'president', 'prime minister',
            'country', 'city', 'world', 'history', 'geography',
            
            # Programming/technical
            'code', 'python', 'javascript', 'programming', 'function', 'algorithm',
            'variable', 'class', 'import', 'syntax',
            
            # Entertainment
            'joke', 'story', 'poem', 'song', 'movie', 'game', 'play',
            
            # Math/science (unless related to expense calculations)
            'calculate the square', 'factorial', 'quantum', 'physics', 'chemistry',
            'biology', 'theorem', 'proof',
            
            # Casual conversation
            'how are you', 'tell me about yourself', 'your name', 'favorite',
            'do you like', 'opinion on'
        ]
        
        # Check for non-expense topics first (higher priority)
        for topic in non_expense_topics:
            if topic in query_lower:
                return False
        
        # Check for expense-related keywords
        for keyword in expense_keywords:
            if keyword in query_lower:
                return True
        
        # If no clear indicators, be conservative and reject
        # (Better to reject ambiguous queries than answer non-expense questions)
        return False

    def generate_response(
        self,
        user_query: str,
        conversation_history: List[Dict[str, str]] = None,
        context: str = None,
        max_length: int = 150,  # Reduced default for faster responses
        temperature: float = 0.5,  # Lower default for faster responses
        top_p: float = 0.7  # Lower default for faster responses
    ) -> str:
        """
        Generate a response using the Gemma model
        
        Args:
            user_query: The user's question/query
            conversation_history: List of previous messages [{"role": "user"/"assistant", "content": "..."}]
            context: Additional context (e.g., search results)
            max_length: Maximum response length
            temperature: Sampling temperature (0.0-1.0)
            top_p: Nucleus sampling parameter
        
        Returns:
            Generated response text
        """
        if not self._initialized or self._model is None:
            # Fallback to simple responses if model not loaded
            return self._fallback_response(user_query, context)
        
        # CRITICAL: If we have search results, always use them even if query validation fails
        # This ensures search results are never ignored
        # Check for various context formats that indicate search results (be very lenient)
        has_search_results = context and (
            "EMBEDDING SEARCH RESULTS" in context or 
            "Found expenses" in context.lower() or 
            "Found expenses and GST claims" in context.lower() or
            "EXPENSE" in context or
            "[EXPENSE" in context or
            "[GST CLAIM]" in context or
            "Results Found:" in context
        )
        
        # Only validate query if we don't have search results
        # If we have search results, the query must be expense-related (search found it)
        if not has_search_results and not self._is_expense_related_query(user_query):
            return "I can only help with office expense-related questions. Please ask about your expenses."
        
        try:
            # Check if using Qwen3 model (has apply_chat_template method)
            is_qwen3 = self._model_name and ("qwen3" in self._model_name.lower() or hasattr(self._tokenizer, 'apply_chat_template'))
            
            response = None
            if is_qwen3:
                # Use Qwen3's chat template format for better responses
                try:
                    response = self._generate_qwen3_response(user_query, conversation_history, context, max_length, temperature, top_p)
                except Exception as e:
                    print(f"Error in Qwen3 response generation: {e}")
                    response = None
            else:
                # Use standard generation for other models
                try:
                    response = self._generate_standard_response(user_query, conversation_history, context, max_length, temperature, top_p)
                except Exception as e:
                    print(f"Error in standard response generation: {e}")
                    response = None
            
            # If model generation failed or returned empty, use fallback
            # ALWAYS use fallback if we have search results - ensures answers are always provided
            if not response or not response.strip():
                return self._fallback_response(user_query, context)
            
            # Check if we have search results and if the response uses them
            if has_search_results:
                # Check if response mentions expenses from the search results
                response_lower = response.lower()
                # Look for indicators that response used search results
                uses_search_results = any(indicator in response_lower for indicator in [
                    'found', 'expense', '₹', 'rupee', 'total', 'amount', 'category', 'cake', 'chocolate', 'gst'
                ]) or any(char.isdigit() for char in response)  # Contains numbers (amounts)
                
                # If response doesn't use search results, use fallback which properly formats them
                if not uses_search_results:
                    return self._fallback_response(user_query, context)
            
            # Validate response is relevant to expenses
            validated_response = self._validate_expense_relevance(response, user_query, context)
            
            # If validation fails but we have search results, ALWAYS use fallback
            if not validated_response:
                if has_search_results:
                    # Search results exist - use fallback to show them properly
                    return self._fallback_response(user_query, context)
                return validated_response or self._fallback_response(user_query, context)
            
            # Response passed validation and uses search results - return it
            return validated_response
            
        except Exception as e:
            print(f"Error generating response: {e}")
            import traceback
            traceback.print_exc()
            # Always return fallback response when errors occur
            return self._fallback_response(user_query, context)
    
    def _generate_qwen3_response(
        self,
        user_query: str,
        conversation_history: List[Dict[str, str]] = None,
        context: str = None,
        max_length: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9
    ) -> str:
        """Generate response using Qwen3's chat template"""
        # Build messages for Qwen3
        messages = []
        
        # Add system message with strict instructions for expense-only responses
        system_message = """You are an AI assistant EXCLUSIVELY for office expense management.

CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:
1. ONLY answer questions about: office expenses, bills, invoices, reimbursements, spending, costs, expense categories, and expense reports
2. NEVER answer questions about: general knowledge, programming, jokes, stories, calculations unrelated to expenses, or any non-expense topics
3. If asked ANYTHING outside expense topics, respond ONLY with: "I can only help with office expense-related questions. Please ask about your expenses."
4. Keep responses SHORT (max 2-3 sentences) and BUSINESS-PROFESSIONAL
5. **MOST IMPORTANT**: If search results are provided, you MUST use them to answer the question. DO NOT say "I couldn't find any expenses" if search results are provided.
6. When search results are provided, summarize the expenses found - mention amounts, categories, items, and totals
7. NEVER generate example conversations, fictional dialogues, or unrelated content
8. Focus on: amounts, categories, dates, person names (if mentioned), and expense details ONLY
9. When user asks about expenses "for [person name]" or "GST in [month]", provide specific answers based on the search results provided
10. Be conversational but concise - answer the user's question directly using the search results provided"""
        
        messages.append({"role": "system", "content": system_message})
        
        # Add context (embedding search results) if available - make it prominent for Qwen
        # IMPORTANT: Qwen model does NOT search - it ONLY creates answers from provided search results
        if context and (
            "EMBEDDING SEARCH RESULTS" in context or 
            "Found expenses" in context or
            "EXPENSE - Found by Embedding Search" in context or
            "[EXPENSE]" in context or
            "[GST CLAIM]" in context
        ):
            embedding_context = f"""CRITICAL INSTRUCTIONS - READ CAREFULLY:

You are the ANSWER GENERATION MODEL (Qwen). Your role is ONLY to create natural language answers.
You do NOT search the database - the embedding model (sentence-transformers/all-MiniLM-L6-v2) has already done ALL searching.

=== ARCHITECTURE ===
1. EMBEDDING MODEL (sentence-transformers/all-MiniLM-L6-v2) → Searches database using semantic similarity
2. YOU (Qwen Model) → ONLY creates answers from the search results provided below

=== YOUR JOB (Answer Generation ONLY) ===
1. Read the embedding search results below (they are already found by the embedding model)
2. Create a clear, natural language answer based ONLY on these results
3. Summarize key information (amounts, categories, items, dates) from the results
4. Answer the user's question using ONLY the provided search results

=== EMBEDDING SEARCH RESULTS (Already Found by Embedding Model) ===
{context}

=== STRICT INSTRUCTIONS FOR YOUR RESPONSE ===
- DO NOT search or query the database yourself - the embedding model already did all searching
- Use ONLY the embedding search results shown above to create your answer
- CRITICAL: Use the EXACT Category shown in each result - DO NOT change, guess, or infer categories
- If Category shows 'Travel', say 'travel'. If it shows 'Food', say 'food'. Use the exact category from the results.
- For petrol/fuel expenses: Check the Category field in the results. If it says 'Travel', the expense is under travel, NOT food.
- Mention specific amounts, categories (use exact category from results), and details from the search results
- If user asks about 'GST in November' or 'Chocolate cake for Gaurav', reference the exact results found above
- Be conversational but factual - base your answer ONLY on the search results provided
- If search results show no matches, say so clearly but suggest trying different keywords
- DO NOT make up, invent, or create any data not in the search results above
- DO NOT change categories - use the exact category shown in the Category field of each result
- DO NOT perform any searching - you only format the provided results into an answer
- Keep response to 2-4 sentences, be concise but informative

REMEMBER: You are an ANSWER FORMATTER, not a SEARCHER. The embedding model handles all database searching.
CRITICAL: Always use the EXACT category from the Category field in the search results."""
            messages.append({"role": "system", "content": embedding_context})
        
        # Add conversation history (limit to last 2 exchanges for faster processing)
        if conversation_history:
            recent_history = conversation_history[-4:]  # Last 2 exchanges (4 messages) - reduced for speed
            for msg in recent_history:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ["user", "assistant"]:
                    messages.append({"role": role, "content": content})
        
        # Add current user query
        messages.append({"role": "user", "content": user_query})
        
        # Apply chat template (disable thinking mode for direct answers)
        try:
            text = self._tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False  # Disable thinking for direct, concise answers
            )
        except (AttributeError, TypeError):
            # Fallback if apply_chat_template doesn't support enable_thinking
            text = self._tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True
            )
        
        # Tokenize
        inputs = self._tokenizer([text], return_tensors="pt")
        device = next(self._model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Generate with optimized settings for faster responses
        with torch.no_grad():
            outputs = self._model.generate(
                **inputs,
                max_new_tokens=min(max_length, 150),  # Reduced for faster generation
                temperature=0.5,  # Lower temperature for faster, more deterministic responses
                top_p=0.7,  # Reduced for faster sampling
                top_k=10,  # Reduced for faster sampling
                do_sample=True,
                repetition_penalty=1.1,  # Slightly reduced
                pad_token_id=self._tokenizer.eos_token_id,
                eos_token_id=self._tokenizer.eos_token_id,
                num_beams=1  # Disable beam search for speed (greedy-like but with sampling)
            )
        
        # Decode response - inputs is a dict, so access input_ids as a dict key
        try:
            # inputs is always a dict from tokenizer, access input_ids correctly
            input_ids = inputs.get('input_ids', inputs.get('input_ids'))
            if isinstance(input_ids, list):
                input_length = len(input_ids[0]) if input_ids else 0
            else:
                input_length = input_ids.shape[1] if len(input_ids.shape) > 1 else input_ids.shape[0]
            
            # Extract only the generated tokens (excluding input)
            generated_ids = outputs[0][input_length:].tolist()
            response = self._tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        except Exception as e:
            # Fallback: decode entire output and remove input prompt
            print(f"Warning: Error decoding response, using fallback: {e}")
            response = self._tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
            # Try to remove prompt text if present
            if user_query in response:
                response = response.split(user_query)[-1].strip()
        
        return response
    
    def _generate_standard_response(
        self,
        user_query: str,
        conversation_history: List[Dict[str, str]] = None,
        context: str = None,
        max_length: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9
    ) -> str:
        """Generate response using standard method for non-Qwen3 models"""
        # Build conversation prompt
        prompt = self._build_prompt(user_query, conversation_history, context)
        
        # Tokenize input
        inputs = self._tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=1024
        )
        
        # Move inputs to same device as model
        device = next(self._model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Generate response with optimized settings for faster responses
        with torch.no_grad():
            outputs = self._model.generate(
                **inputs,
                max_new_tokens=min(max_length, 150),  # Reduced for faster generation
                temperature=0.5,  # Lower temperature for faster responses
                top_p=0.7,  # Reduced for faster sampling
                do_sample=True,
                pad_token_id=self._tokenizer.eos_token_id,
                eos_token_id=self._tokenizer.eos_token_id,
                repetition_penalty=1.1,  # Slightly reduced
                no_repeat_ngram_size=2,  # Reduced for speed
                num_beams=1  # Disable beam search for speed
            )
        
        # Decode response
        generated_text = self._tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Extract only the assistant's response (remove prompt)
        response = generated_text[len(prompt):].strip()
        
        return response
    
    def _validate_expense_relevance(self, response: str, user_query: str, context: str = None) -> str:
        """Validate that response is relevant to expenses, filter out unrelated content"""
        if not response:
            return ""
        
        response_lower = response.lower()
        query_lower = user_query.lower()
        
        # If we have search results in context, be more lenient with validation
        has_search_results = context and "Found expenses:" in context
        
        # Check if response contains expense-related keywords
        expense_keywords = [
            'expense', 'expenses', 'cost', 'amount', 'rupee', 'rs', '₹', 'petrol', 'fuel',
            'travel', 'food', 'lunch', 'dinner', 'taxi', 'hotel', 'bill', 'receipt',
            'category', 'spending', 'spent', 'found', 'search', 'result', 'gst', 'tax',
            'chocolate', 'cake', 'gaurav', 'november', 'nov', 'total', 'sum'
        ]
        
        # Check if query is expense-related
        query_is_expense_related = any(keyword in query_lower for keyword in expense_keywords + ['nov', 'november', 'dec', 'december', 'month', 'date', 'for'])
        
        # If we have search results, the response should reference them
        # Be more lenient - accept responses that mention numbers, amounts, or seem relevant
        if has_search_results:
            # Check if response mentions amounts, numbers, or expense-related terms
            has_amounts = any(char.isdigit() for char in response) or '₹' in response or 'rs' in response_lower
            has_expense_terms = any(keyword in response_lower for keyword in expense_keywords)
            has_relevant_info = 'found' in response_lower or 'total' in response_lower or 'expense' in response_lower
            
            # If response has any relevant indicators, accept it (more lenient)
            if has_amounts or has_expense_terms or has_relevant_info:
                # Remove example conversations but keep the response
                if "User:" in response or "user:" in response_lower:
                    for separator in ["User:", "user:"]:
                        if separator in response:
                            before_user = response.split(separator)[0].strip()
                            if len(before_user) > 10:
                                response = before_user
                                break
                
                # Limit response length
                if len(response) > 400:  # Increased limit for search results
                    last_period = response[:400].rfind('.')
                    if last_period > 50:
                        response = response[:last_period + 1]
                    else:
                        response = response[:400].strip() + "..."
                
                return response
        
        # If query is expense-related but response doesn't mention expenses, check more carefully
        if query_is_expense_related and not any(keyword in response_lower for keyword in expense_keywords):
            # Check if response is a redirect message (which is acceptable)
            if "can only help" in response_lower or "expense-related" in response_lower:
                return response
            # If we have search results, don't reject - might be a valid response format
            if not has_search_results:
                return ""
        
        # If query is NOT expense-related, response should redirect
        if not query_is_expense_related:
            if "can only help" in response_lower or "expense-related" in response_lower:
                return response  # Good redirect
            # If response doesn't redirect, add redirect message
            if len(response) > 50:  # If response is long, it's probably answering unrelated question
                return "I can only help with expense-related questions. Please ask about your expenses."
        
        # Remove example conversations
        if "User:" in response or "user:" in response_lower:
            # Split at first "User:" and take only before it
            for separator in ["User:", "user:"]:
                if separator in response:
                    before_user = response.split(separator)[0].strip()
                    if len(before_user) > 10:
                        response = before_user
                        break
                    else:
                        return ""  # Not enough content before "User:", likely example conversation
        
        # Limit response length
        if len(response) > 300:
            last_period = response[:300].rfind('.')
            if last_period > 50:
                response = response[:last_period + 1]
            else:
                response = response[:300].strip() + "..."
        
        return response

    def _build_prompt(
        self,
        user_query: str,
        conversation_history: List[Dict[str, str]] = None,
        context: str = None
    ) -> str:
        """Build the prompt for the model with strict expense-only focus"""
        system_prompt = """You are an AI assistant EXCLUSIVELY for office expense management.

CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:
1. ONLY answer questions about: office expenses, bills, invoices, reimbursements, spending, costs, expense categories, and expense reports
2. NEVER answer questions about: general knowledge, programming, jokes, stories, calculations unrelated to expenses, or any non-expense topics
3. If asked ANYTHING outside expense topics, respond ONLY with: "I can only help with office expense-related questions. Please ask about your expenses."
4. Keep responses SHORT (max 2-3 sentences) and BUSINESS-PROFESSIONAL
5. If search results provided, summarize ONLY the expenses shown - do NOT make up data
6. NEVER generate example conversations, fictional dialogues, or unrelated content
7. Focus on: amounts, categories, dates, and expense details ONLY"""
        
        prompt_parts = [system_prompt]
        
        # Add context (embedding search results) if available - put this before history for better context
        if context and ("EMBEDDING SEARCH RESULTS" in context or "Found expenses" in context):
            embedding_context_str = "=== EMBEDDING SEARCH RESULTS ===\n"
            embedding_context_str += "The following results come from semantic embedding search (sentence-transformers model). Use these results to answer the user's question accurately.\n\n"
            embedding_context_str += context + "\n\n"
            embedding_context_str += "INSTRUCTIONS: Answer the user's question using ONLY the search results above. Be specific about amounts, categories, and details found."
            prompt_parts.append(embedding_context_str)
        
        # Add recent conversation history if available (limit to 2 exchanges for faster processing)
        if conversation_history:
            # Take only the last 2 exchanges to keep it short and fast
            recent_history = conversation_history[-4:]  # Last 2 exchanges (4 messages)
            for msg in recent_history:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "user":
                    prompt_parts.append(f"User: {content}")
                elif role == "assistant":
                    prompt_parts.append(f"Assistant: {content}")
        
        # Add current user query
        prompt_parts.append(f"User: {user_query}\nAssistant:")
        
        return "\n".join(prompt_parts)

    def _fallback_response(self, user_query: str, context: str = None) -> str:
        """Enhanced fallback response when model is not available or validation fails"""
        from datetime import datetime
        query_lower = user_query.lower()
        
        # CRITICAL: If we have embedding search results, ALWAYS use them, even if query validation fails
        has_search_results = context and (
            "EMBEDDING SEARCH RESULTS" in context or 
            "Found expenses" in context or 
            "Found expenses and GST claims" in context or
            "[EXPENSE - Found by Embedding Search]" in context or
            "[EXPENSE]" in context or
            "[GST CLAIM]" in context or
            "EXPENSE - Found by Embedding Search" in context
        )
        
        if has_search_results:
            # Extract useful information from context for a clean response
            lines = context.split('\n')
            results = []
            total_amount = 0
            
            # Look for the summary section first to get accurate totals
            in_summary = False
            summary_lines = []
            summary_total = 0
            summary_expense_count = 0
            for line in lines:
                if "=== SUMMARY ===" in line:
                    in_summary = True
                    continue
                if in_summary:
                    if "Total Amount:" in line:
                        # Extract total amount from summary (most accurate)
                        try:
                            amount_part = line.split("₹")[1].strip()
                            summary_total = float(amount_part.replace(",", ""))
                            total_amount = summary_total  # Use summary total as primary source
                        except:
                            pass
                        summary_lines.append(line.strip())
                    elif "Total Expenses Found:" in line:
                        # Extract expense count
                        try:
                            count_part = line.split(":")[1].strip()
                            summary_expense_count = int(count_part)
                        except:
                            pass
                        summary_lines.append(line.strip())
                    elif line.strip() and not line.strip().startswith("IMPORTANT"):
                        summary_lines.append(line.strip())
                    if "IMPORTANT:" in line:
                        break
            
            # Parse individual expense/GST entries - improved to capture all expenses
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                
                # Look for expense or GST claim entries
                if ("[EXPENSE" in line or "[GST CLAIM]" in line or "EXPENSE - Found" in line) and i + 1 < len(lines):
                    result_text = []
                    result_text.append(line.replace("[", "").replace("]", ""))
                    
                    # Collect details for this expense - look further ahead to capture all details
                    j = i + 1
                    detail_count = 0
                    while j < len(lines) and detail_count < 10:  # Increased limit to capture all details
                        detail_line = lines[j].strip()
                        if detail_line and not detail_line.startswith("==="):
                            if "Label:" in detail_line or "Vendor:" in detail_line:
                                result_text.append(f"  {detail_line}")
                                detail_count += 1
                            elif "Amount: ₹" in detail_line:
                                result_text.append(f"  {detail_line}")
                                try:
                                    amount_str = detail_line.split("₹")[1].strip()
                                    amount = float(amount_str.replace(",", ""))
                                    total_amount += amount
                                except:
                                    pass
                                detail_count += 1
                            elif "Category:" in detail_line:
                                result_text.append(f"  {detail_line}")
                                detail_count += 1
                            elif "Item:" in detail_line:
                                result_text.append(f"  {detail_line}")
                                detail_count += 1
                        j += 1
                        # Check if we've reached the next expense entry
                        if j < len(lines):
                            next_line = lines[j].strip()
                            if (next_line.startswith("[") and ("EXPENSE" in next_line or "GST CLAIM" in next_line)) or "=== SUMMARY ===" in next_line:
                                break
                    
                    if len(result_text) > 1:
                        results.append("\n".join(result_text))
                    i = j
                else:
                    i += 1
            
            # Build response with proper category extraction
            if results:
                # Extract structured data from results for better summary
                expense_data = []
                for result in results:
                    lines = result.split('\n')
                    expense_info = {
                        'label': '',
                        'amount': 0,
                        'category': '',
                        'item': ''
                    }
                    for line in lines:
                        if 'Label:' in line:
                            expense_info['label'] = line.split('Label:')[1].strip()
                        elif 'Vendor:' in line:
                            expense_info['label'] = line.split('Vendor:')[1].strip()
                        elif 'Amount: ₹' in line:
                            try:
                                amount_str = line.split('₹')[1].strip()
                                expense_info['amount'] = float(amount_str.replace(',', ''))
                            except:
                                pass
                        elif 'Category:' in line:
                            expense_info['category'] = line.split('Category:')[1].strip()
                        elif 'Item:' in line:
                            expense_info['item'] = line.split('Item:')[1].strip()
                    if expense_info['label'] or expense_info['amount'] > 0:
                        expense_data.append(expense_info)
                
                # Build natural language summary using correct categories
                response_parts = []
                
                # Create summary based on query type
                if any(word in query_lower for word in ['gst', 'tax']):
                    response_parts.append(f"I found {len(expense_data)} GST claim(s) matching your query.")
                elif any(word in query_lower for word in ['jan', 'january', 'feb', 'february', 'mar', 'march', 
                                                           'apr', 'april', 'may', 'jun', 'june', 'jul', 'july', 
                                                           'aug', 'august', 'sep', 'september', 'oct', 'october', 
                                                           'nov', 'november', 'dec', 'december']):
                    # Extract month name from query for better response
                    month_name = None
                    month_map = {
                        'jan': 'January', 'january': 'January',
                        'feb': 'February', 'february': 'February',
                        'mar': 'March', 'march': 'March',
                        'apr': 'April', 'april': 'April',
                        'may': 'May',
                        'jun': 'June', 'june': 'June',
                        'jul': 'July', 'july': 'July',
                        'aug': 'August', 'august': 'August',
                        'sep': 'September', 'september': 'September',
                        'oct': 'October', 'october': 'October',
                        'nov': 'November', 'november': 'November',
                        'dec': 'December', 'december': 'December'
                    }
                    for key, name in month_map.items():
                        if key in query_lower:
                            month_name = name
                            break
                    
                    # Extract year if mentioned
                    year_match = None
                    import re
                    year_match = re.search(r'\b(20\d{2})\b', query_lower)
                    year_str = year_match.group(1) if year_match else str(datetime.now().year)
                    
                    # Group by item name for specific item queries (like "cake")
                    if any(word in query_lower for word in ['cake', 'petrol', 'fuel', 'lunch', 'dinner']):
                        # Find the item keyword
                        item_keyword = None
                        for word in ['cake', 'petrol', 'fuel', 'lunch', 'dinner', 'breakfast']:
                            if word in query_lower:
                                item_keyword = word
                                break
                        
                        if item_keyword:
                            # Filter expenses that match the item keyword
                            matching_expenses = [exp for exp in expense_data 
                                                if item_keyword in (exp['label'] + ' ' + exp['item']).lower()]
                            
                            if matching_expenses:
                                # Calculate total from all matching expenses
                                parsed_total = sum(exp['amount'] for exp in matching_expenses)
                                category = matching_expenses[0]['category'] or 'Other'
                                
                                # Use summary total if available (more accurate as it includes all displayed results)
                                # Only use it if we have matching expenses to confirm it's the right category
                                if summary_total > 0 and summary_total >= parsed_total:
                                    # Summary total is calculated from all displayed results, use it
                                    total = summary_total
                                    # Use the count from summary if available
                                    record_count = summary_expense_count if summary_expense_count > 0 else len(matching_expenses)
                                else:
                                    # Use parsed total if summary is not available or seems incorrect
                                    total = parsed_total
                                    record_count = len(matching_expenses)
                                
                                if record_count == 1:
                                    response_parts.append(f"The {item_keyword} expense in {month_name} {year_str} was ₹{total:.2f}, categorized as {category}.")
                                else:
                                    response_parts.append(f"The total {item_keyword} expense for {month_name} {year_str} was ₹{total:.2f}, categorized as {category}. Found {record_count} record(s).")
                            else:
                                # If no matching expenses found but we have a total, use it
                                if summary_total > 0 and expense_data:
                                    total = summary_total
                                    category = expense_data[0]['category'] or 'Other'
                                    record_count = summary_expense_count if summary_expense_count > 0 else len(expense_data)
                                    response_parts.append(f"I found {record_count} expense(s) for {month_name} {year_str} with a total of ₹{total:.2f}, categorized as {category}.")
                                else:
                                    response_parts.append(f"I found {len(expense_data)} expense(s) for {month_name} {year_str}.")
                        else:
                            # Group by category for month queries without specific item
                            categories = {}
                            for exp in expense_data:
                                cat = exp['category'] or 'Other'
                                if cat not in categories:
                                    categories[cat] = []
                                categories[cat].append(exp)
                            
                            if len(categories) == 1:
                                cat_name = list(categories.keys())[0]
                                total = sum(exp['amount'] for exp in expense_data)
                                response_parts.append(f"The total expense for {month_name} {year_str} was ₹{total:.2f}, categorized as {cat_name}.")
                            else:
                                total = sum(exp['amount'] for exp in expense_data)
                                response_parts.append(f"I found {len(expense_data)} expense(s) for {month_name} {year_str} with a total of ₹{total:.2f}.")
                    else:
                        # General month query without specific item
                        total = sum(exp['amount'] for exp in expense_data)
                        response_parts.append(f"I found {len(expense_data)} expense(s) for {month_name} {year_str} with a total of ₹{total:.2f}.")
                elif any(word in query_lower for word in ['petrol', 'fuel', 'diesel', 'gas']):
                    # Special handling for fuel-related queries
                    fuel_expenses = [exp for exp in expense_data if any(word in (exp['label'] + ' ' + exp['item']).lower() for word in ['petrol', 'fuel', 'diesel', 'gas'])]
                    if fuel_expenses:
                        total = sum(exp['amount'] for exp in fuel_expenses)
                        # Use the category from the search results, default to 'travel' if missing
                        category = fuel_expenses[0]['category'] or 'travel'
                        response_parts.append(f"The petrol expense is ₹{total:.2f}, categorized under {category.lower()}.")
                    else:
                        response_parts.append(f"I found {len(expense_data)} expense(s) matching your query.")
                elif any(word in query_lower for word in ['cake', 'food', 'lunch', 'dinner']):
                    # Special handling for food-related queries
                    food_expenses = [exp for exp in expense_data if any(word in (exp['label'] + ' ' + exp['item']).lower() for word in ['cake', 'food', 'lunch', 'dinner', 'breakfast'])]
                    if food_expenses:
                        total = sum(exp['amount'] for exp in food_expenses)
                        category = food_expenses[0]['category'] or 'food'
                        item_name = food_expenses[0]['label'] or food_expenses[0]['item'] or 'item'
                        response_parts.append(f"The {item_name.lower()} expense is ₹{total:.2f}, categorized under {category.lower()}.")
                    else:
                        response_parts.append(f"I found {len(expense_data)} expense(s) matching your query.")
                elif any(word in query_lower for word in ['for']):
                    response_parts.append(f"I found {len(expense_data)} expense(s) for that person.")
                else:
                    # Generic response - use first result's category
                    if expense_data:
                        first_exp = expense_data[0]
                        item_name = first_exp['label'] or first_exp['item'] or 'expense'
                        amount = first_exp['amount']
                        category = first_exp['category'] or 'other'
                        if len(expense_data) == 1:
                            response_parts.append(f"The {item_name.lower()} expense is ₹{amount:.2f}, categorized under {category.lower()}.")
                        else:
                            total = sum(exp['amount'] for exp in expense_data)
                            response_parts.append(f"I found {len(expense_data)} expense(s) with a total of ₹{total:.2f}.")
                    else:
                        response_parts.append(f"I found {len(results)} result(s) matching your query.")
                
                # Add total if we have it
                if total_amount > 0 and len(expense_data) > 1:
                    response_parts.append(f"Total Amount: ₹{total_amount:.2f}")
                elif summary_lines:
                    # Use summary if available
                    response_parts.append("\n" + "\n".join(summary_lines))
                
                return "\n".join(response_parts)
            
            # If no parsed results but context exists, return simplified context
            if context:
                # Try to extract just the key information
                simplified = []
                for line in context.split('\n'):
                    if any(keyword in line for keyword in ["Label:", "Vendor:", "Amount:", "Category:", "Total Amount:"]):
                        simplified.append(line.strip())
                if simplified:
                    return "Found expenses:\n" + "\n".join(simplified[:10])
            
            return context if context else "I couldn't find any matching results."
        
        # Validate expense-related query only if no search results
        if not self._is_expense_related_query(user_query):
            return "I can only help with office expense-related questions. Please ask about your expenses."
        
        # Handle greetings FIRST (before checking context)
        if query_lower in ['hi', 'hello', 'hey', 'hey there', 'help']:
            return "Hello! 👋 I can help you search and understand your expenses. What would you like to know about your expenses?"
        
        # Handle no results case
        if context and "No expenses found" in context:
            # Provide helpful suggestions
            suggestions = []
            if "pertol" in query_lower or "petrol" in query_lower:
                suggestions.append("Did you mean 'petrol' instead of 'pertol'?")
            if any(month in query_lower for month in ['nov', 'november']):
                suggestions.append("Try searching for 'November' or 'Nov' expenses.")
            
            response = f"I couldn't find any expenses matching '{user_query}'."
            if suggestions:
                response += f"\n\n💡 Suggestions:\n" + "\n".join(f"• {s}" for s in suggestions)
            response += "\n\nTry rephrasing your query or checking the spelling."
            return response
        
        # Generic helpful response for expense-related queries
        return f"I'm searching for information about '{user_query}'. Let me help you find relevant expenses."

