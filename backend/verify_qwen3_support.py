"""
Quick verification script to check if transformers version supports Qwen3.
"""
import transformers

print(f"Transformers version: {transformers.__version__}")

version_parts = transformers.__version__.split('.')
major_version = int(version_parts[0])
minor_version = int(version_parts[1]) if len(version_parts) > 1 else 0

has_qwen3_support = (major_version > 4) or (major_version == 4 and minor_version >= 51)

if has_qwen3_support:
    print(f"✅ Qwen3-0.6B is SUPPORTED (transformers >= 4.51.0)")
    print("The chatbot will now use Qwen/Qwen3-0.6B as the primary model.")
else:
    print(f"❌ Qwen3-0.6B is NOT supported (need transformers >= 4.51.0)")
    print("The chatbot will use fallback models.")
