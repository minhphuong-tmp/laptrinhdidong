import { supabase } from "../lib/supabase";
import { uploadFile } from "./imageService";

export const createOrUpdatePost = async (post) => {
    try {
        // upload image
        if (post.file && typeof post.file === 'object') {
            let isImage = post?.file?.type === 'image';
            let folderName = isImage ? 'postImages' : 'postVideos';
            let fileResult = await uploadFile(folderName, post?.file?.uri, isImage);
            if (fileResult.success) post.file = fileResult.data;
            else return fileResult;
        }


        const { data, error } = await supabase
            .from('posts')
            .upsert(post)
            .select()
            .single();

        if (error) {
            console.log('createPost error:', error);
            return { success: false, msg: 'Could not create your post' };
        }
        return { success: true, data: data };
    } catch (error) {
        console.log('createPost error:', error);
        return { success: false, msg: 'Could not create your post' };
    }
}



export const fetchPost = async (limit, userId) => {
    try {
        if (userId) {
            const { data, error } = await supabase
                .from('posts')
                .select(`
                *,
                user:users(id,name,image),
                postLikes(*),
                comments (count)


                `)
                .order('created_at', { ascending: false })
                .eq('userId', userId)
                .limit(limit);

            if (error) {
                console.log('fetchPosts error:', error);
                return { success: false, msg: 'Could not fetch the posts' };
            }
            return { success: true, data: data };

        } else {
            const { data, error } = await supabase
                .from('posts')
                .select(`
                *,
                user:users(id,name,image),
                postLikes(*),
                comments (count)


                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.log('fetchPosts error:', error);
                return { success: false, msg: 'Could not fetch the posts' };
            }
            return { success: true, data: data };

        }

    } catch (error) {
        console.log('fetchPost error:', error);
        return { success: false, msg: 'Could not fetchPost your post' };
    }
}




export const fetchPostDetails = async (postId) => {
    try {
        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                user:users(id,name,image),
                postLikes(*),
                comments(*, user:users(id,name,image))

                `)
            .eq('id', postId)
            .order('created_at', { ascending: false, foreignTable: 'comments' })
            .single();
        if (error) {
            console.log('fetchPostsDetails error:', error);
            return { success: false, msg: 'Could not fetch the posts details' };
        }
        return { success: true, data: data };

    } catch (error) {
        console.log('fetchPostDetails error:', error);
        return { success: false, msg: 'Could not fetchPost your post details' };
    }
}



export const createPostLike = async (postLikes) => {
    try {

        const { data, error } = await supabase
            .from('postLikes')
            .insert(postLikes)
            .select()
            .single();
        if (error) {
            console.log('Post like error:', error);
            return { success: false, msg: 'Could not fetch the posts like' };
        }
        return { success: true, data: data };

    } catch (error) {
        console.log('fetchPost error:', error);
        return { success: false, msg: 'Could not fetchPost your post like' };
    }
}

export const removePostLike = async (postId, userId) => {
    try {

        const { error } = await supabase
            .from('postLikes')
            .delete()
            .eq('postId', postId)
            .eq('userId', userId);
        if (error) {
            console.log('Post delete error:', error);
            return { success: false, msg: 'Could not fetch the posts delete' };
        }
        return { success: true };

    } catch (error) {
        console.log('fetchPost error:', error);
        return { success: false, msg: 'Could not fetchPost your post delete' };
    }
}



export const createComment = async (comment) => {
    try {

        const { data, error } = await supabase
            .from('comments')
            .insert(comment)
            .select()
            .single();
        if (error) {
            console.log('comments  error:', error);
            return { success: false, msg: 'Could not fetch the comments ' };
        }
        return { success: true, data: data };

    } catch (error) {
        console.log('comments error:', error);
        return { success: false, msg: 'Could not comments' };
    }
}

export const removeComment = async (commentId) => {
    try {

        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);
        if (error) {
            console.log('Comment delete error:', error);
            return { success: false, msg: 'Could not fetch the comments delete' };
        }
        return { success: true, data: { commentId } };

    } catch (error) {
        console.log('comment error:', error);
        return { success: false, msg: 'Could not fetchPost your comment delete' };
    }
}

export const removePost = async (postId) => {
    try {

        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', postId);
        if (error) {
            console.log('Posts delete error:', error);
            return { success: false, msg: 'Could not fetch the Post delete' };
        }
        return { success: true, data: { postId } };

    } catch (error) {
        console.log('Posts error:', error);
        return { success: false, msg: 'Could not fetchPost your Posts delete' };
    }
}