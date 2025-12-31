from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.expenses_manager import ExpensesManagerItem, ItemType
from app.schemas.expenses_manager import (
    ExpensesManagerItemCreate,
    ExpensesManagerItemUpdate,
    ExpensesManagerItemResponse,
    CategoryCreate
)
from app.security import get_current_user, TokenData, require_role
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/admin/expenses-manager", tags=["expenses-manager"])

# Predefined categories
PREDEFINED_CATEGORIES = [
    "Tea/Coffee",
    "WIFI Recharge",
    "Phone Recharge",
    "Birthday",
    "Grocery",
    "Electronic items"
]

@router.get("/categories")
async def get_categories(
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Get all categories (predefined + custom from database)"""
    # Get unique categories from existing items
    custom_categories = db.query(ExpensesManagerItem.category).distinct().all()
    custom_category_list = [cat[0] for cat in custom_categories if cat[0] not in PREDEFINED_CATEGORIES]
    
    # Combine predefined and custom categories
    all_categories = PREDEFINED_CATEGORIES + sorted(custom_category_list)
    return {"categories": all_categories}

@router.post("/categories")
async def add_category(
    category_data: CategoryCreate,
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Add a new custom category"""
    category = category_data.category.strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    
    # Check if category already exists
    if category in PREDEFINED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Category already exists in predefined list")
    
    # Check if category already exists in database
    existing = db.query(ExpensesManagerItem).filter(
        ExpensesManagerItem.category == category
    ).first()
    
    if existing:
        return {"message": "Category already exists", "category": category}
    
    # Category will be saved when an item with this category is created
    return {"message": "Category will be available after creating an item with it", "category": category}

@router.delete("/categories/{category_name:path}")
async def delete_category(
    category_name: str,
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Delete a custom category (cannot delete predefined categories)"""
    from urllib.parse import unquote
    category = unquote(category_name).strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    
    # Cannot delete predefined categories
    if category in PREDEFINED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Cannot delete predefined categories")
    
    # Check if category is being used by any items
    items_with_category = db.query(ExpensesManagerItem).filter(
        ExpensesManagerItem.category == category
    ).all()
    items_count = len(items_with_category)
    
    # Update all items using this category to use the first predefined category as default
    default_category = PREDEFINED_CATEGORIES[0] if PREDEFINED_CATEGORIES else "Tea/Coffee"
    
    if items_count > 0:
        for item in items_with_category:
            item.category = default_category
        db.commit()
        logger.info(f"Updated {items_count} item(s) from category '{category}' to '{default_category}'")
    
    # Category can be deleted (items have been updated if needed)
    # Since categories are only stored as part of items, once all items are updated,
    # the category effectively no longer exists
    return {
        "message": f"Category '{category}' deleted successfully" + (f". {items_count} item(s) were updated to '{default_category}'." if items_count > 0 else ""),
        "category": category,
        "items_updated": items_count
    }

@router.get("/items", response_model=List[ExpensesManagerItemResponse])
async def get_items(
    item_type: ItemType = None,
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Get all expenses manager items, optionally filtered by type"""
    query = db.query(ExpensesManagerItem)
    if item_type:
        query = query.filter(ExpensesManagerItem.item_type == item_type)
    
    # Sort by date in ascending order (oldest first), then by id for consistent ordering
    items = query.order_by(ExpensesManagerItem.date.asc(), ExpensesManagerItem.id.asc()).all()
    return items

@router.post("/items", response_model=ExpensesManagerItemResponse)
async def create_item(
    item_data: ExpensesManagerItemCreate,
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Create a new expenses manager item"""
    try:
        item = ExpensesManagerItem(
            item_type=item_data.item_type,
            date=item_data.date,
            item_name=item_data.item_name,
            amount=item_data.amount,
            category=item_data.category
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        logger.info(f"Expenses manager item {item.id} created successfully")
        return item
    except Exception as e:
        logger.error(f"Error creating expenses manager item: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating item: {str(e)}")

@router.put("/items/{item_id}", response_model=ExpensesManagerItemResponse)
async def update_item(
    item_id: int,
    item_data: ExpensesManagerItemUpdate,
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Update an expenses manager item"""
    item = db.query(ExpensesManagerItem).filter(ExpensesManagerItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        if item_data.date is not None:
            item.date = item_data.date
        if item_data.item_name is not None:
            item.item_name = item_data.item_name
        if item_data.amount is not None:
            item.amount = item_data.amount
        if item_data.category is not None:
            item.category = item_data.category
        
        db.commit()
        db.refresh(item)
        logger.info(f"Expenses manager item {item.id} updated successfully")
        return item
    except Exception as e:
        logger.error(f"Error updating expenses manager item: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating item: {str(e)}")

@router.delete("/items/{item_id}")
async def delete_item(
    item_id: int,
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Delete an expenses manager item"""
    item = db.query(ExpensesManagerItem).filter(ExpensesManagerItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        db.delete(item)
        db.commit()
        logger.info(f"Expenses manager item {item_id} deleted successfully")
        return {"message": "Item deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting expenses manager item: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting item: {str(e)}")

