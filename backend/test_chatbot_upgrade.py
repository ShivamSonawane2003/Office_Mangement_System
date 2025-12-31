"""
Test script to verify the upgraded chatbot service handles expense-only queries correctly.

This script tests:
1. Query validation gate (rejecting non-expense queries)
2. Expense-related query acceptance
3. Fallback responses
4. System prompt enforcement
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.chatbot_service import ChatbotService


def test_query_validation():
    """Test the _is_expense_related_query method"""
    print("=" * 80)
    print("Testing Query Validation Gate")
    print("=" * 80)
    
    chatbot = ChatbotService.get_instance()
    
    # Test cases: (query, expected_result, description)
    test_cases = [
        # Valid expense queries
        ("Show my petrol expenses for November", True, "Valid: Expense query with date"),
        ("How much did I spend on lunch?", True, "Valid: Spending query"),
        ("Total food expenses", True, "Valid: Total expense query"),
        ("Find taxi bills", True, "Valid: Bill search"),
        ("November expenses", True, "Valid: Date-based query"),
        ("search expenses", True, "Valid: Generic expense search"),
        ("hi", True, "Valid: Greeting"),
        ("help", True, "Valid: Help request"),
        
        # Invalid non-expense queries  
        ("Who is Elon Musk?", False, "Invalid: General knowledge"),
        ("Write Python code to sort a list", False, "Invalid: Programming request"),
        ("Tell me a joke", False, "Invalid: Entertainment"),
        ("What is the capital of France?", False, "Invalid: Geography"),
        ("How are you doing?", False, "Invalid: Casual conversation"),
        ("Calculate the factorial of 5", False, "Invalid: Math unrelated to expenses"),
        ("Who is the president?", False, "Invalid: General knowledge"),
        ("Tell me a story", False, "Invalid: Entertainment"),
        ("What is quantum physics?", False, "Invalid: Science question"),
    ]
    
    passed = 0
    failed = 0
    
    for query, expected, description in test_cases:
        result = chatbot._is_expense_related_query(query)
        status = "✓ PASS" if result == expected else "✗ FAIL"
        
        if result == expected:
            passed += 1
        else:
            failed += 1
        
        print(f"\n{status} | {description}")
        print(f"  Query: '{query}'")
        print(f"  Expected: {expected}, Got: {result}")
    
    print("\n" + "=" * 80)
    print(f"Test Results: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print("=" * 80)
    
    return failed == 0


def test_response_generation():
    """Test response generation with the validation gate"""
    print("\n" + "=" * 80)
    print("Testing Response Generation")
    print("=" * 80)
    
    chatbot = ChatbotService.get_instance()
    
    # Test cases: (query, should_reject, description)
    test_cases = [
        # Valid expense queries - should get helpful response
        ("Show my November petrol expenses", False, "Valid expense query"),
        ("How much did I spend on food?", False, "Valid spending query"),
        
        # Invalid queries - should get rejection message
        ("Who is Elon Musk?", True, "Invalid: General knowledge"),
        ("Write Python code", True, "Invalid: Programming"),
        ("Tell me a joke", True, "Invalid: Entertainment"),
    ]
    
    rejection_message = "I can only help with office expense-related questions. Please ask about your expenses."
    
    print("\nNote: Testing without model initialization (using fallback responses)")
    print("The key test is whether non-expense queries are rejected.\n")
    
    passed = 0
    failed = 0
    
    for query, should_reject, description in test_cases:
        response = chatbot.generate_response(query)
        is_rejected = response == rejection_message
        
        if should_reject:
            # Should be rejected
            status = "✓ PASS" if is_rejected else "✗ FAIL"
            if is_rejected:
                passed += 1
            else:
                failed += 1
        else:
            # Should NOT be rejected
            status = "✓ PASS" if not is_rejected else "✗ FAIL"
            if not is_rejected:
                passed += 1
            else:
                failed += 1
        
        print(f"{status} | {description}")
        print(f"  Query: '{query}'")
        print(f"  Response: {response[:100]}...")
        print()
    
    print("=" * 80)
    print(f"Test Results: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print("=" * 80)
    
    return failed == 0


def main():
    print("\n🧪 CHATBOT SERVICE VERIFICATION TESTS")
    print("=" * 80)
    print("Testing the upgraded Office Expense Chatbot")
    print("Model: Qwen/Qwen3-0.6B (primary)")
    print("=" * 80)
    
    # Run tests
    validation_passed = test_query_validation()
    response_passed = test_response_generation()
    
    # Final summary
    print("\n" + "=" * 80)
    print("FINAL TEST SUMMARY")
    print("=" * 80)
    print(f"Query Validation Tests: {'✓ PASSED' if validation_passed else '✗ FAILED'}")
    print(f"Response Generation Tests: {'✓ PASSED' if response_passed else '✗ FAILED'}")
    
    if validation_passed and response_passed:
        print("\n✅ ALL TESTS PASSED! The chatbot is configured correctly.")
        print("   - Query validation gate is working")
        print("   - Non-expense queries are rejected")
        print("   - Expense queries are accepted")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED! Review the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
