import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

const UserAvatar = ({ user, size, rounded, style }) => {
    const [userAvatar, setUserAvatar] = useState(null);

    useEffect(() => {
        const getUserAvatar = async () => {
            console.log('UserAvatar - user:', user);
            if (user?.id) {
                try {
                    console.log('UserAvatar - fetching avatar for user ID:', user.id);
                    const { data } = await supabase
                        .from('users')
                        .select('image')
                        .eq('id', user.id)
                        .single();
                    
                    console.log('UserAvatar - database response:', data);
                    if (data?.image) {
                        setUserAvatar(data.image);
                        console.log('UserAvatar - user avatar from DB:', data.image);
                    } else {
                        console.log('UserAvatar - no image in database, using fallback');
                    }
                } catch (error) {
                    console.log('Error getting user avatar:', error);
                }
            } else {
                console.log('UserAvatar - no user ID provided');
            }
        };
        
        getUserAvatar();
    }, [user?.id]);

    return (
        <Avatar
            uri={userAvatar || user?.user_metadata?.image || user?.image}
            size={size}
            rounded={rounded}
            style={style}
        />
    );
};

export default UserAvatar;

