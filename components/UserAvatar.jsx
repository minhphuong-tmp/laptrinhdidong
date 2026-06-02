import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

const UserAvatar = ({ user, size, rounded, style }) => {
    const [userAvatar, setUserAvatar] = useState(null);

    useEffect(() => {
        const getUserAvatar = async () => {
            if (user?.id) {
                try {
                    const { data } = await supabase
                        .from('users')
                        .select('image')
                        .eq('id', user.id)
                        .single();

                    if (data?.image) {
                        setUserAvatar(data.image);
                    } else {
                    }
                } catch (error) {
                    console.log('Error getting user avatar:', error);
                }
            } else {
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

