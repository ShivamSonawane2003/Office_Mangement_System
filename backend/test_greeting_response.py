"""
Test script to verify greeting handling and fallback response logic.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.chatbot_service import ChatbotService

def test_greeting_response():
    print("=" * 60)
    print("Testing Greeting Response Logic")
    print("=" * 60)
    
    chatbot = ChatbotService.get_instance()
    
    # Test case 1: Greeting with NO context (simulating search.py fix)
    print("\nTest 1: Greeting with NO context")
    response = chatbot._fallback_response("hi", context=None)
    print(f"Query: 'hi', Context: None")
    print(f"Response: {response}")
    
    expected_greeting = "Hello! 👋 I can help you search"
    if expected_greeting in response:
        print("✓ PASS")
    else:
        print("✗ FAIL")
        
    # Test case 2: Greeting with 'No expenses found' context (simulating worst case)
    # Even if context says "No expenses found", the chatbot service should now prioritize the greeting
    print("\nTest 2: Greeting with 'No expenses found' context")
    response = chatbot._fallback_response("hi", context="No expenses found matching the query.")
    print(f"Query: 'hi', Context: 'No expenses found...'")
    print(f"Response: {response}")
    
    if expected_greeting in response:
        print("✓ PASS (ChatbotService correctly prioritized greeting)")
    else:
        print("✗ FAIL (ChatbotService failed to prioritize greeting)")

    # Test case 3: Non-greeting with 'No expenses found' context
    print("\nTest 3: Non-greeting with 'No expenses found' context")
    response = chatbot._fallback_response("show me apples", context="No expenses found matching the query.")
    print(f"Query: 'show me apples', Context: 'No expenses found...'")
    print(f"Response: {response}")
    
    if "couldn't find any expenses" in response:
        print("✓ PASS")
    else:
        print("✗ FAIL")

if __name__ == "__main__":
    test_greeting_response()
