const { error } = require('console');
const Category = require('../../models/categorySchema')
// const Product = require('../../models/productSchema')

const CategoryInfo = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 4;
      const skip = (page - 1) * limit;
  
      const searchQuery = req.query.search || '';  // Capture search input
  
      let query = {};
      if (searchQuery) {
        query = {
          name: { $regex: searchQuery, $options: 'i' } // case-insensitive search
        };
      }
  
      const categorydata = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      const totalCategories = await Category.countDocuments(query);
      const totalPages = Math.ceil(totalCategories / limit);
  
      res.render('category', {
        cat: categorydata,
        currentPage: page,
        totalPages: totalPages,
        totalCategories: totalCategories,
        searchQuery: searchQuery, // Pass search term to view
      });
  
    } catch (error) {
      console.error('Error while Loading category page', error);
      res.redirect('/pageerror');
    }
  };
  
  

const addCategory = async (req,res)=>{
    const {name,description} = req.body
    try {
        const existingCategory = await Category.findOne({name})
         if(existingCategory){
            return res.status(400).json({error:'Category already exists'})
         }
         const newCategory = new Category({
            name,
            description,
         })
         await newCategory.save()
         return res.json({message:'Category added Succesfully'})       
    } catch (error) {
        return res.status(500).json({error:'Internal Server Error'})
        
    }
}


const getListCategory = async (req,res)=>{
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}})
        res.redirect('/admin/category')
        
    } catch (error) {
        res.redirect('/pageerror')
        
    }
}



const getUnListcategory = async (req,res)=>{
    try {

        let id = req.query.id
        await Category.updateOne({_id:id},{$set:{isListed:true}})
        res.redirect('/admin/category')
             
    } catch (error) {
               res.redirect('/pageerror')
    }
        
    }

    const deleteCategory = async (req, res) => {
        try {
          const categoryId = req.params.id;
      
          const deletedCategory = await Category.findByIdAndDelete(categoryId);
      
          if (!deletedCategory) {
            return res.status(404).json({ error: 'Category not found' });
          }
      
          res.json({ message: 'Category deleted successfully' });
        } catch (error) {
          console.error('Error deleting category:', error);
          res.status(500).json({ error: 'Internal Server Error' });
        }
      };


      const getEditCategory = async (req,res)=>{
        try {
            const id = req.query.id;
            const category= await Category.findOne({_id:id})
            res.render('edit-category',{category:category})
            
        } catch (error) {
            res.redirect('/pageerror')
            
        }
      }
      
const editCategory = async (req,res)=>{
    try {
        const id = req.params.id
        const {categoryname,description} = req.body
        const existingcategory = await Category.findOne({name:categoryname})

        if(existingcategory){
            return res.status(400).json({error:"category exists,PLease choose another name "})
        }

        const updatCategory =  await Category.findByIdAndUpdate(id,{
            name:categoryname,
            description:description,
        },{new:true})

        if(updatCategory){
            res.redirect('/admin/category')
        }else{
            res.status(404).json({error:'category not found '})

        }
        
    } catch (error) {
        res.status(500).json({error:"Internal Server Error"})
        
    }
}


module.exports={
    CategoryInfo,
    addCategory,
    getListCategory,
    getUnListcategory,
    deleteCategory,
    getEditCategory,
    editCategory
}