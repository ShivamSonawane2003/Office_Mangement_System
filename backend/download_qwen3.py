"""
Script to download Qwen/Qwen3-0.6B model from Hugging Face
This will cache the model in ./models directory
"""
from transformers import AutoTokenizer, AutoModelForCausalLM
import os

def download_qwen3_model():
    model_name = "Qwen/Qwen3-0.6B"
    cache_dir = "./models"
    
    print(f"Downloading {model_name}...")
    print(f"Model will be cached in: {os.path.abspath(cache_dir)}")
    print("This may take a few minutes depending on your internet connection...\n")
    
    try:
        # Create cache directory if it doesn't exist
        os.makedirs(cache_dir, exist_ok=True)
        
        # Download tokenizer
        print("Step 1/2: Downloading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            trust_remote_code=True
        )
        print("✓ Tokenizer downloaded successfully!\n")
        
        # Download model
        print("Step 2/2: Downloading model (this may take longer)...")
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            cache_dir=cache_dir,
            trust_remote_code=True,
            torch_dtype="auto",
            low_cpu_mem_usage=True
        )
        print("✓ Model downloaded successfully!\n")
        
        print(f"✅ Successfully downloaded {model_name}!")
        print(f"Model cached at: {os.path.abspath(cache_dir)}")
        
    except Exception as e:
        print(f"❌ Error downloading model: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure you have transformers>=4.51.0 installed: pip install --upgrade transformers>=4.51.0")
        print("2. Check your internet connection")
        print("3. If you need authentication, set HUGGINGFACE_TOKEN environment variable")
        raise

if __name__ == "__main__":
    download_qwen3_model()

