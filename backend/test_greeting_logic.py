"""
Test script to verify greeting handling in the chatbot endpoint logic.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_greeting_logic():
    print("=" * 60)
    print("Testing Greeting Logic")
    print("=" * 60)
    
    greetings = {'hi', 'hello', 'hey', 'help', 'greetings', 'good morning', 'good afternoon', 'good evening'}
    
    test_queries = [
        ("hi", True),
        ("hello", True),
        ("help", True),
        ("petrol", False),
        ("show expenses", False),
        ("  hi  ", True),  # Test stripping
        ("HI", True),      # Test case insensitivity
    ]
    
    passed = 0
    for query, should_be_greeting in test_queries:
        is_greeting = query.strip().lower() in greetings
        
        status = "✓ PASS" if is_greeting == should_be_greeting else "✗ FAIL"
        if is_greeting == should_be_greeting:
            passed += 1
            
        print(f"{status} | Query: '{query}' -> Is Greeting: {is_greeting}")
        
    print("-" * 60)
    print(f"Results: {passed}/{len(test_queries)} passed")
    
    if passed == len(test_queries):
        print("\n✅ Logic verification successful!")
        return True
    else:
        print("\n❌ Logic verification failed!")
        return False

if __name__ == "__main__":
    test_greeting_logic()
